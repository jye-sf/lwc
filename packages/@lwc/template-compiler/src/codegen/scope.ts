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

interface ComponentPropsUsageData {
    name: string;
    gen: string;
    usage: NodeRefProxy;
    instances: number;
}

export function dumpScope(scope: Scope, body: t.Statement[], scopeVars: Map<string, string>) {
    const nextScope = new Map(scopeVars);
    const variablesInThisScope: [string, string][] = [];

    for (const [name, propData] of scope.usedProps) {
        // the variable is already defined in the scope.
        const generatedNameInScope = scopeVars.get(name);
        if (generatedNameInScope !== undefined) {
            propData.usage.swap(t.identifier(generatedNameInScope));
        } else if (propData.instances > 1 || scope.aggregatedPropNamesUsedInChildScopes.has(name)) {
            // name is not defined in the outer scope, and is:
            // a) used multiple times in this scope.
            // b) used one time in this scope and at least once in one of the child scopes. Therefore
            //    we can compute it here.
            nextScope.set(propData.name, propData.gen);
            propData.usage.swap(t.identifier(propData.gen));
            variablesInThisScope.push([propData.name, propData.gen]);
        }
    }

    for (const childScope of scope.childScopes) {
        body.unshift(childScope.mainFn!);
        dumpScope(childScope, childScope.mainFn?.body!.body!, nextScope);
    }

    // lastly, insert variables defined in this scope at the beginning of the body.
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
    id: number;
    parentScope: Scope | null = null;
    childScopes: Scope[] = [];
    mainFn: t.FunctionDeclaration | null = null;

    usedProps = new Map<string, ComponentPropsUsageData>();
    _cachedAggregatedProps: Set<string> | undefined;

    get aggregatedPropNamesUsedInChildScopes(): Set<string> {
        if (this._cachedAggregatedProps === undefined) {
            const aggregatedScope = new Set<string>();

            for (const scope of this.childScopes) {
                // Aggregated props is defined as:
                // props used in child scopes + props used in the aggregated props of child scope.
                for (const [propName] of scope.usedProps) {
                    aggregatedScope.add(propName);
                }

                for (const propName of scope.aggregatedPropNamesUsedInChildScopes) {
                    aggregatedScope.add(propName);
                }
            }

            this._cachedAggregatedProps = aggregatedScope;
        }

        return this._cachedAggregatedProps;
    }

    constructor(scopeId: number) {
        this.id = scopeId;
    }

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

        return memoizedPropName.usage.instance;
    }
}
