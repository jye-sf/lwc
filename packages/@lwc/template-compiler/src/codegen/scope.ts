/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */
import * as t from '../shared/estree';

let scopes = 0;

export function dumpScope(scope: Scope, body: t.Statement[]) {
    scope.childScopes.forEach((childScope) => {
        body.unshift(childScope.mainFn!);
        dumpScope(childScope, childScope.mainFn?.body!.body!);
    });
}

export class Scope {
    id: number = ++scopes;
    parentScope: Scope | null = null;
    childScopes: Scope[] = [];
    mainFn: t.FunctionDeclaration | null = null;

    setFn(
        params: t.FunctionExpression['params'],
        body: t.FunctionExpression['body'],
        kind: string
    ) {
        const id = t.identifier(`${kind}${this.id}_${this.childScopes.length}`);

        this.mainFn = t.functionDeclaration(id, params, body);

        return id;
    }
}
