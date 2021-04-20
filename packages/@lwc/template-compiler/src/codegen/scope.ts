/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import * as t from '../shared/estree';
import { TemplateIdentifier } from '../shared/types';
import { NodeRefProxy } from './NodeRefProxy';
import { TEMPLATE_PARAMS } from '../shared/constants';

let scopes = 0;

interface ComponentPropsUsageData {
    name: string;
    gen: string;
    usage: NodeRefProxy;
    instances: number;
}

export function dumpScope(scope: Scope, body: t.Statement[], scopeVars: Map<string, string>) {
    const nextScope = new Map(scopeVars);
    const variablesInThisScope: [string, string][] = [];

    Array.from(scope.usedProps).forEach(([name, propData]) => {
        // the variable is already defined in the scope.
        const generatedNameInScope = scopeVars.get(name);
        if (generatedNameInScope !== undefined) {
            propData.usage.swap(t.identifier(generatedNameInScope));
        } else if (propData.instances > 1) {
            // name is not defined in the outer scope and is used multiple times in this scope.
            nextScope.set(propData.name, propData.gen);
            propData.usage.swap(t.identifier(propData.gen));
            variablesInThisScope.push([propData.name, propData.gen]);
        }
    });

    scope.childScopes.forEach((childScope) => {
        body.unshift(childScope.mainFn!);
        dumpScope(childScope, childScope.mainFn?.body!.body!, nextScope);
    });

    // lastly insert variables defined in this scope at the beginning of the body.
    if (variablesInThisScope.length > 0) {
        body.unshift(
            t.variableDeclaration('const', [
                t.variableDeclarator(
                    t.objectPattern(
                        variablesInThisScope.map(([name, localName]) =>
                            t.assignmentProperty(t.identifier(name), t.identifier(localName))
                        )
                    ),
                    t.identifier(TEMPLATE_PARAMS.INSTANCE)
                ),
            ])
        );
    }
}

export class Scope {
    id: number = ++scopes;
    parentScope: Scope | null = null;
    childScopes: Scope[] = [];
    mainFn: t.FunctionDeclaration | null = null;

    usedProps = new Map<string, ComponentPropsUsageData>();

    setFn(
        params: t.FunctionExpression['params'],
        body: t.FunctionExpression['body'],
        kind: string
    ) {
        const id = t.identifier(`${kind}${this.id}_${this.childScopes.length}`);

        this.mainFn = t.functionDeclaration(id, params, body);

        return id;
    }

    getPropName(identifier: TemplateIdentifier): t.MemberExpression | t.Identifier {
        const { name } = identifier;
        let memoizedPropName = this.usedProps.get(name);

        if (!memoizedPropName) {
            const generatedExpr = new NodeRefProxy(
                t.memberExpression(t.identifier(TEMPLATE_PARAMS.INSTANCE), identifier)
            );
            memoizedPropName = {
                name,
                gen: `$cv${this.id}_${this.usedProps.size}`,
                usage: generatedExpr,
                instances: 0,
            };
            this.usedProps.set(name, memoizedPropName);
        }

        memoizedPropName.instances++;
        //
        // else if (!memoizedPropName.replaced) {
        //     memoizedPropName.firstUse.swap(t.identifier(memoizedPropName.gen));
        //     memoizedPropName.replaced = true;
        // }

        return memoizedPropName.usage.instance;
    }
}
