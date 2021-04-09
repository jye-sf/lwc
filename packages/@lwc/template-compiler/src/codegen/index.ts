/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import * as astring from 'astring';
import * as parse5 from 'parse5-with-errors';

import { isBooleanAttribute } from '@lwc/shared';
import { TemplateErrors, generateCompilerError } from '@lwc/errors';

import State from '../state';

import {
    isCommentNode,
    isElement,
    isCustomElement,
    isTemplate,
    isTextNode,
    isSlot,
} from '../shared/ir';
import { TEMPLATE_PARAMS, TEMPLATE_FUNCTION_NAME } from '../shared/constants';
import {
    IRNode,
    IRElement,
    IRText,
    IRAttribute,
    IRAttributeType,
    IRComment,
} from '../shared/types';

import CodeGen from './codegen';
import {
    identifierFromComponentName,
    objectToAST,
    shouldFlatten,
    memorizeHandler,
    containsDynamicChildren,
} from './helpers';

import { format as formatModule } from './formatters/module';
import { format as formatFunction } from './formatters/function';

import * as t from '../shared/estree';
import {
    isAllowedFragOnlyUrlsXHTML,
    isAttribute,
    isFragmentOnlyUrl,
    isIdReferencingAttribute,
    isSvgUseHref,
} from '../parser/attribute';
import { dumpScope } from './scope';

function transform(root: IRElement, codeGen: CodeGen, state: State): t.Expression {
    function transformElement(element: IRElement): t.Expression {
        const databag = elementDataBag(element);
        let res: t.Expression | t.SpreadElement;

        const children = transformChildren(element.children);

        // Check wether it has the special directive lwc:dynamic
        if (element.lwc && element.lwc.dynamic) {
            const expression = codeGen.bindExpression(element.lwc.dynamic, element);
            res = codeGen.genDynamicElement(element.tag, expression, databag, children);
        } else if (isCustomElement(element)) {
            // Make sure to register the component
            const componentClassName = element.component!;

            res = codeGen.genCustomElement(
                element.tag,
                identifierFromComponentName(componentClassName),
                databag,
                children
            );
        } else if (isSlot(element)) {
            const defaultSlot = children;

            res = codeGen.getSlot(element.slotName!, databag, defaultSlot);
        } else {
            res = codeGen.genElement(element.tag, databag, children);
        }

        res = applyInlineIf(element, res);
        res = applyInlineFor(element, res);

        return res as t.Expression;
    }

    function transformTemplate(element: IRElement): t.Expression | t.ArrayExpression['elements'] {
        const children = transformChildren(element.children);

        let res = applyTemplateIf(element, children);

        if (t.isSpreadElement(res)) {
            res = t.arrayExpression([res]);
        }

        if (element.forEach) {
            res = applyTemplateFor(element, res);
        } else if (element.forOf) {
            res = applyTemplateForOf(element, res);
        }

        if (t.isArrayExpression(res) && element.if) {
            return res.elements;
        } else {
            return res;
        }
    }

    function transformText(text: IRText): t.Expression {
        const { value } = text;
        return codeGen.genText(
            typeof value === 'string' ? value : codeGen.bindExpression(value, text)
        );
    }

    function transformComment(comment: IRComment): t.Expression {
        return codeGen.genComment(comment.value);
    }

    function transformChildren(children: IRNode[]): t.Expression {
        const res = children.reduce<t.Expression[]>((acc, child) => {
            let expr;

            if (isElement(child)) {
                // if scope should go first because is processed first in transformElement
                if (child.if) {
                    codeGen.createScope();
                }

                if (child.forEach || child.forOf) {
                    codeGen.createScope();
                }

                expr = isTemplate(child) ? transformTemplate(child) : transformElement(child);
            } else if (isTextNode(child)) {
                expr = transformText(child);
            } else if (isCommentNode(child)) {
                expr = transformComment(child);
            }

            return acc.concat(expr as t.Expression);
        }, []);

        if (shouldFlatten(children, state)) {
            if (children.length === 1 && !containsDynamicChildren(children)) {
                return res[0];
            } else {
                return codeGen.genFlatten([t.arrayExpression(res)]);
            }
        } else {
            return t.arrayExpression(res);
        }
    }

    function applyInlineIf(
        element: IRElement,
        node: t.Expression,
        testExpression?: t.Expression,
        falseValue?: t.Expression
    ): t.Expression {
        if (!element.if) {
            return node;
        }

        const ifScope = codeGen.currentScope;
        codeGen.popScope();

        if (!testExpression) {
            testExpression = codeGen.bindExpression(element.if!, element);
        }

        const pTestExpr = t.identifier('t');
        let leftExpression: t.Expression;
        const modifier = element.ifModifier!;
        if (modifier === 'true') {
            leftExpression = pTestExpr;
        } else if (modifier === 'false') {
            leftExpression = t.unaryExpression('!', pTestExpr);
        } else if (modifier === 'strict-true') {
            leftExpression = t.binaryExpression('===', pTestExpr, t.literal(true));
        } else {
            throw generateCompilerError(TemplateErrors.UNKNOWN_IF_MODIFIER, {
                messageArgs: [modifier],
            });
        }

        const falsyArray = t.isArrayExpression(node)
            ? t.arrayExpression(node.elements.map(() => falseValue ?? t.literal(null)))
            : falseValue ?? t.literal(null);

        const params = [pTestExpr];

        const ifFn = ifScope.setFn(
            params,
            t.blockStatement([
                t.returnStatement(t.conditionalExpression(leftExpression, node, falsyArray)),
            ]),
            'if'
        );

        return t.callExpression(ifFn, [testExpression]);
    }

    function applyInlineFor(element: IRElement, node: t.Expression) {
        if (!element.forEach) {
            return node;
        }

        const { expression, item, index } = element.forEach;
        const params = [item];
        if (index) {
            params.push(index);
        }

        const forEachFn = codeGen.currentScope.setFn(
            params,
            t.blockStatement([t.returnStatement(node)]),
            'foreach'
        );

        codeGen.popScope();

        const iterable = codeGen.bindExpression(expression, element);

        return codeGen.genIterator(iterable, forEachFn);
    }

    function applyInlineForOf(element: IRElement, node: t.Expression) {
        if (!element.forOf) {
            return node;
        }

        const { expression, iterator } = element.forOf;
        const { name: iteratorName } = iterator;

        const argsMapping = {
            value: `${iteratorName}Value`,
            index: `${iteratorName}Index`,
            first: `${iteratorName}First`,
            last: `${iteratorName}Last`,
        };

        const iteratorArgs = Object.values(argsMapping).map((arg) => t.identifier(arg));
        const iteratorObjet = t.objectExpression(
            Object.entries(argsMapping).map(([prop, arg]) =>
                t.property(t.identifier(prop), t.identifier(arg))
            )
        );

        const forOfFn = codeGen.currentScope.setFn(
            iteratorArgs,
            t.blockStatement([
                t.variableDeclaration('const', [
                    t.variableDeclarator(t.identifier(iteratorName), iteratorObjet),
                ]),
                t.returnStatement(node),
            ]),
            'forof'
        );

        codeGen.popScope();

        // still we don't take into account the scope variables, we will soon
        const iterable = codeGen.bindExpression(expression, element);

        return codeGen.genIterator(iterable, forOfFn);
        // return codeGen.genIterator(iterable, iterationFunction);
    }

    function applyTemplateForOf(element: IRElement, fragmentNodes: t.Expression) {
        let expression = fragmentNodes;
        if (t.isArrayExpression(expression) && expression.elements.length === 1) {
            expression = expression.elements[0] as t.Expression;
        }

        return applyInlineForOf(element, expression);
    }

    function applyTemplateFor(element: IRElement, fragmentNodes: t.Expression): t.Expression {
        let expression = fragmentNodes;
        if (t.isArrayExpression(expression) && expression.elements.length === 1) {
            expression = expression.elements[0] as t.Expression;
        }

        return applyInlineFor(element, expression);
    }

    function applyTemplateIf(
        element: IRElement,
        fragmentNodes: t.Expression
    ): t.Expression | t.SpreadElement {
        if (!element.if) {
            return fragmentNodes;
        }

        if (t.isArrayExpression(fragmentNodes)) {
            // Bind the expression once for all the template children
            const testExpression = codeGen.bindExpression(element.if!, element);

            // Notice that no optimization can be done when there's only one element, because it may be an if call
            // which uses the spread element.
            if (
                fragmentNodes.elements.length === 1 &&
                fragmentNodes.elements[0]?.type !== 'SpreadElement'
            ) {
                return applyInlineIf(element, fragmentNodes.elements[0]!, testExpression);
            }

            const ifCall = applyInlineIf(element, fragmentNodes, testExpression);

            // The if's will always be inside an [];
            return t.spreadElement(ifCall);
        } else {
            // If the template has a single children, make sure the ternary expression returns an array
            return applyInlineIf(element, fragmentNodes, undefined, t.arrayExpression([]));
        }
    }

    function computeAttrValue(attr: IRAttribute, element: IRElement): t.Expression {
        const { namespaceURI, tagName } = element.__original as parse5.AST.Default.Element;
        const isUsedAsAttribute = isAttribute(element, attr.name);

        switch (attr.type) {
            case IRAttributeType.Expression: {
                const expression = codeGen.bindExpression(attr.value, element);

                // TODO [#2012]: Normalize global boolean attrs values passed to custom elements as props
                if (isUsedAsAttribute && isBooleanAttribute(attr.name, tagName)) {
                    // We need to do some manipulation to allow the diffing algorithm add/remove the attribute
                    // without handling special cases at runtime.
                    return codeGen.genBooleanAttributeExpr(expression);
                }
                if (attr.name === 'tabindex') {
                    return codeGen.genTabIndex([expression]);
                }
                if (attr.name === 'id' || isIdReferencingAttribute(attr.name)) {
                    return codeGen.genScopedId(expression);
                }
                if (
                    state.shouldScopeFragmentId &&
                    isAllowedFragOnlyUrlsXHTML(tagName, attr.name, namespaceURI)
                ) {
                    return codeGen.genScopedFragId(expression);
                }
                if (isSvgUseHref(tagName, attr.name, namespaceURI)) {
                    return t.callExpression(t.identifier('sanitizeAttribute'), [
                        t.literal(tagName),
                        t.literal(namespaceURI),
                        t.literal(attr.name),
                        codeGen.genScopedFragId(expression),
                    ]);
                }

                return expression;
            }

            case IRAttributeType.String: {
                if (attr.name === 'id') {
                    return codeGen.genScopedId(attr.value);
                }
                if (attr.name === 'spellcheck') {
                    return t.literal(attr.value.toLowerCase() !== 'false');
                }

                if (!isUsedAsAttribute && isBooleanAttribute(attr.name, tagName)) {
                    // We are in presence of a string value, for a recognized boolean attribute, which is used as
                    // property. for these cases, always set the property to true.
                    return t.literal(true);
                }

                if (isIdReferencingAttribute(attr.name)) {
                    return codeGen.genScopedId(attr.value);
                }
                if (
                    state.shouldScopeFragmentId &&
                    isAllowedFragOnlyUrlsXHTML(tagName, attr.name, namespaceURI) &&
                    isFragmentOnlyUrl(attr.value)
                ) {
                    return codeGen.genScopedFragId(attr.value);
                }
                if (isSvgUseHref(tagName, attr.name, namespaceURI)) {
                    return t.callExpression(t.identifier('sanitizeAttribute'), [
                        t.literal(tagName),
                        t.literal(namespaceURI),
                        t.literal(attr.name),
                        isFragmentOnlyUrl(attr.value)
                            ? codeGen.genScopedFragId(attr.value)
                            : t.literal(attr.value),
                    ]);
                }
                return t.literal(attr.value);
            }

            case IRAttributeType.Boolean: {
                // A boolean value used in an attribute should always generate .setAttribute(attr.name, ''),
                // regardless if is a boolean attribute or not.
                return isUsedAsAttribute ? t.literal('') : t.literal(attr.value);
            }
        }
    }

    function elementDataBag(element: IRElement): t.ObjectExpression {
        const data: t.Property[] = [];
        const { classMap, className, style, styleMap, attrs, props, on, forKey, lwc } = element;

        // Class attibute defined via string
        if (className) {
            const classExpression = codeGen.bindExpression(className, element);
            data.push(t.property(t.identifier('className'), classExpression));
        }

        // Class attribute defined via object
        if (classMap) {
            const classMapObj = objectToAST(classMap, () => t.literal(true));
            data.push(t.property(t.identifier('classMap'), classMapObj));
        }

        // Style attribute defined via object
        if (styleMap) {
            const styleObj = objectToAST(styleMap, (key) => t.literal(styleMap[key]));
            data.push(t.property(t.identifier('styleMap'), styleObj));
        }

        // Style attribute defined via string
        if (style) {
            const styleExpression = codeGen.bindExpression(style, element);
            data.push(t.property(t.identifier('style'), styleExpression));
        }

        // Attributes
        if (attrs) {
            const attrsObj = objectToAST(attrs, (key) => computeAttrValue(attrs[key], element));
            data.push(t.property(t.identifier('attrs'), attrsObj));
        }

        // Properties
        if (props) {
            const propsObj = objectToAST(props, (key) => computeAttrValue(props[key], element));
            data.push(t.property(t.identifier('props'), propsObj));
        }

        // Context
        if (lwc?.dom) {
            const contextObj = t.objectExpression([
                t.property(
                    t.identifier('lwc'),
                    t.objectExpression([t.property(t.identifier('dom'), t.literal(lwc.dom))])
                ),
            ]);
            data.push(t.property(t.identifier('context'), contextObj));
        }

        // Key property on VNode
        if (forKey) {
            // If element has user-supplied `key` or is in iterator, call `api.k`
            const forKeyExpression = codeGen.bindExpression(forKey, element);
            const generatedKey = codeGen.genKey(t.literal(codeGen.generateKey()), forKeyExpression);
            data.push(t.property(t.identifier('key'), generatedKey));
        } else {
            // If stand alone element with no user-defined key
            // member expression id
            data.push(t.property(t.identifier('key'), t.literal(codeGen.generateKey())));
        }

        // Event handler
        if (on) {
            const onObj = objectToAST(on, (key) => {
                const componentHandler = codeGen.bindExpression(on[key], element);
                const handler = codeGen.genBind(componentHandler);

                return memorizeHandler(codeGen, element, componentHandler, handler);
            });
            data.push(t.property(t.identifier('on'), onObj));
        }

        return t.objectExpression(data);
    }

    return transformChildren(root.children);
}

function generateTemplateFunction(templateRoot: IRElement, state: State): t.FunctionDeclaration {
    const codeGen = new CodeGen();

    const returnedValue = transform(templateRoot, codeGen, state);

    const args = [
        TEMPLATE_PARAMS.API,
        TEMPLATE_PARAMS.INSTANCE,
        TEMPLATE_PARAMS.SLOT_SET,
        TEMPLATE_PARAMS.CONTEXT,
    ].map((id) => t.identifier(id));

    const body: t.Statement[] = [
        t.variableDeclaration('const', [
            t.variableDeclarator(
                t.objectPattern(
                    Object.keys(codeGen.usedApis).map((name) =>
                        t.assignmentProperty(t.identifier(name), codeGen.usedApis[name])
                    )
                ),
                t.identifier(TEMPLATE_PARAMS.API)
            ),
        ]),
    ];

    const foo = codeGen.getUsedComponentProperties();

    if (Object.keys(foo).length > 0) {
        body.push(
            t.variableDeclaration('const', [
                t.variableDeclarator(
                    t.objectPattern(
                        Object.keys(foo).map((name) =>
                            t.assignmentProperty(t.identifier(name), foo[name])
                        )
                    ),
                    t.identifier(TEMPLATE_PARAMS.INSTANCE)
                ),
            ])
        );
    }

    dumpScope(codeGen.currentScope, body);

    if (Object.keys(codeGen.usedSlots).length) {
        body.push(
            t.variableDeclaration('const', [
                t.variableDeclarator(
                    t.objectPattern(
                        Object.keys(codeGen.usedApis).map((name) =>
                            t.assignmentProperty(t.literal(name), codeGen.usedSlots[name], {
                                computed: true,
                            })
                        )
                    ),
                    t.identifier(TEMPLATE_PARAMS.SLOT_SET)
                ),
            ])
        );
    }

    if (codeGen.memorizedIds.length) {
        body.push(
            t.variableDeclaration('const', [
                t.variableDeclarator(
                    t.objectPattern(
                        codeGen.memorizedIds.map((id) =>
                            t.assignmentProperty(id, id, { shorthand: true })
                        )
                    ),
                    t.identifier(TEMPLATE_PARAMS.CONTEXT)
                ),
            ])
        );
    }

    body.push(t.returnStatement(returnedValue));

    return t.functionDeclaration(
        t.identifier(TEMPLATE_FUNCTION_NAME),
        args,
        t.blockStatement(body)
    );
}

function format({ config }: State) {
    switch (config.format) {
        case 'function':
            return formatFunction;

        default:
            return formatModule;
    }
}

export default function (templateRoot: IRElement, state: State): string {
    const templateFunction = generateTemplateFunction(templateRoot, state);
    const formatter = format(state);
    const program = formatter(templateFunction, state);

    return astring.generate(program);
}
