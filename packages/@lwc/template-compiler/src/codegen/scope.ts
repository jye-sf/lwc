/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import { walk } from 'estree-walker';

import * as t from '../shared/estree';
// import { TEMPLATE_PARAMS } from '../shared/constants';
import { isComponentProp } from '../shared/ir';
import { IRNode, TemplateExpression, TemplateIdentifier } from '../shared/types';

const usedProps = new Map<string, string>();

function getPropName(identifier: TemplateIdentifier): string {
    const { name } = identifier;
    let memoizedPropName = usedProps.get(name);

    if (!memoizedPropName) {
        memoizedPropName = `$cv${usedProps.size}`;
        usedProps.set(name, memoizedPropName);
    }

    return memoizedPropName;
}

export function getUsedComponentProperties(): { [name: string]: t.Identifier } {
    const result: { [name: string]: t.Identifier } = {};

    usedProps.forEach((cp, memoizedName) => {
        result[memoizedName] = t.identifier(cp);
    });

    return result;
}

/**
 * Bind the passed expression to the component instance. It applies the following transformation to the expression:
 * - {value} --> {$cmp.value}
 * - {value[index]} --> {$cmp.value[$cmp.index]}
 */
export function bindExpression(expression: TemplateExpression, irNode: IRNode): t.Expression {
    if (t.isIdentifier(expression)) {
        if (isComponentProp(expression, irNode)) {
            return t.identifier(getPropName(expression));
            // return t.memberExpression(t.identifier(TEMPLATE_PARAMS.INSTANCE), expression);
        } else {
            return expression;
        }
    }

    walk(expression, {
        leave(node, parent) {
            if (
                parent !== null &&
                t.isIdentifier(node) &&
                t.isMemberExpression(parent) &&
                parent.object === node &&
                isComponentProp(node, irNode)
            ) {
                this.replace(t.identifier(getPropName(node)));
                // this.replace(t.memberExpression(t.identifier(TEMPLATE_PARAMS.INSTANCE), node));
            }
        },
    });

    return expression;
}
