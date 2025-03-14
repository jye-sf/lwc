/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */

import path from 'node:path';
import { vi, describe, beforeAll, afterAll } from 'vitest';
import { rollup } from 'rollup';
import lwcRollupPlugin from '@lwc/rollup-plugin';
import { testFixtureDir, formatHTML, pluginVirtual } from '@lwc/test-utils-lwc-internals';
import { setFeatureFlagForTest } from '../index';
import type { LightningElementConstructor } from '@lwc/engine-core/dist/framework/base-lightning-element';
import type { RollupLwcOptions } from '@lwc/rollup-plugin';
import type { FeatureFlagName } from '@lwc/features/dist/types';

vi.mock('lwc', async () => {
    const lwcEngineServer = await import('../index');
    try {
        lwcEngineServer.setHooks({ sanitizeHtmlContent: String });
    } catch (_err) {
        // Ignore error if the hook is already overridden
    }
    return lwcEngineServer;
});

interface FixtureConfig {
    /**
     * Component name that serves as the entrypoint / root component of the fixture.
     * @example x/test
     */
    entry: string;

    /** Props to provide to the root component. */
    props?: Record<string, string>;

    /** Feature flags to enable for the test. */
    features: FeatureFlagName[];
}

async function compileFixture({
    entry,
    dirname,
    options,
}: {
    entry: string;
    dirname: string;
    options?: RollupLwcOptions;
}) {
    const optionsAsString =
        Object.entries(options ?? {})
            .map(([key, value]) => `${key}=${value}`)
            .join('-') || 'default';
    const modulesDir = path.resolve(dirname, './modules');
    const outputFile = path.resolve(dirname, `./dist/compiled-${optionsAsString}.js`);
    const input = 'virtual/fixture/test.js';

    const bundle = await rollup({
        input,
        external: ['lwc', '@lwc/ssr-runtime', 'vitest'],
        plugins: [
            pluginVirtual(`export { default } from "${entry}";`, input),
            lwcRollupPlugin({
                enableDynamicComponents: true,
                experimentalDynamicComponent: {
                    loader: path.join(__dirname, './utils/custom-loader.js'),
                    strictSpecifier: false,
                },
                modules: [
                    {
                        dir: modulesDir,
                    },
                ],
                ...options,
            }),
        ],
        onwarn({ message, code }) {
            // TODO [#3331]: The existing lwc:dynamic fixture test will generate warnings that can be safely suppressed.
            const shouldIgnoreWarning =
                message.includes('LWC1187') ||
                // TODO [#4497]: stop warning on duplicate slots or disallow them entirely (LWC1137 is duplicate slots)
                message.includes('LWC1137') ||
                // IGNORED_SLOT_ATTRIBUTE_IN_CHILD is fine; it is used in some of these tests
                message.includes('LWC1201') ||
                message.includes('-h-t-m-l') ||
                code === 'CIRCULAR_DEPENDENCY' ||
                // TODO [#5010]: template-compiler -> index -> validateElement generates UNKNOWN_HTML_TAG_IN_TEMPLATE for MathML elements
                message.includes('LWC1123');
            if (!shouldIgnoreWarning) {
                throw new Error(message);
            }
        },
    });

    await bundle.write({
        file: outputFile,
        format: 'esm',
        exports: 'named',
    });

    return outputFile;
}

function testFixtures(options?: RollupLwcOptions) {
    testFixtureDir<FixtureConfig>(
        {
            root: path.resolve(__dirname, 'fixtures'),
            ssrVersion: 1,
            pattern: '**/config.json',
        },
        async ({ dirname, config }) => {
            let compiledFixturePath;

            try {
                compiledFixturePath = await compileFixture({
                    entry: config!.entry,
                    dirname,
                    options,
                });
            } catch (err: any) {
                // Filter out the stacktrace, just include the LWC error message
                const message = err?.message?.match(/(LWC\d+[^\n]+)/)?.[1] ?? err.message;
                return {
                    'expected.html': '',
                    'error.txt': message,
                };
            }

            // The LWC engine holds global state like the current VM index, which has an impact on
            // the generated HTML IDs. So the engine has to be re-evaluated between tests.
            // On top of this, the engine also checks if the component constructor is an instance of
            // the LightningElement. Therefor the compiled module should also be evaluated in the
            // same sandbox registry as the engine.
            const lwcEngineServer = await import('../index');

            let result;
            let err;
            try {
                config?.features?.forEach((flag) => {
                    lwcEngineServer.setFeatureFlagForTest(flag, true);
                });

                const module: LightningElementConstructor = (await import(compiledFixturePath))
                    .default;

                result = formatHTML(
                    lwcEngineServer.renderComponent('fixture-test', module, config?.props ?? {})
                );
            } catch (_err: any) {
                if (_err?.name === 'AssertionError') {
                    throw _err;
                }
                err = _err?.message || 'An empty error occurred?!';
            }

            config?.features?.forEach((flag) => {
                lwcEngineServer.setFeatureFlagForTest(flag, false);
            });

            return {
                'expected.html': result,
                'error.txt': err,
            };
        }
    );
}

// TODO [#5134]: Enable these tests in production mode
describe.skipIf(process.env.NODE_ENV === 'production').concurrent('fixtures', () => {
    beforeAll(() => {
        // ENABLE_WIRE_SYNC_EMIT is used because this mimics the behavior for LWR in SSR mode. It's also more reasonable
        // for how both `engine-server` and `ssr-runtime` behave, which is to use sync rendering.
        setFeatureFlagForTest('ENABLE_WIRE_SYNC_EMIT', true);
    });

    afterAll(() => {
        setFeatureFlagForTest('ENABLE_WIRE_SYNC_EMIT', false);
    });

    describe.concurrent('default', () => {
        testFixtures();
    });

    // Test with and without the static content optimization to ensure the fixtures are the same
    describe.concurrent('enableStaticContentOptimization=false', () => {
        testFixtures({ enableStaticContentOptimization: false });
    });
});
