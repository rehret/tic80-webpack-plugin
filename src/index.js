'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const validateOptions = require('schema-utils');
const ConcatSource = require('webpack-sources').ConcatSource;

const SCHEMA = Object.seal({
    type: 'object',
    properties: {
        cartridgePath: {
            type: 'string'
        }
    },
    additionalProperties: false
});

const PLUGIN_NAME = 'tic80-webpack-plugin';
const DEFAULT_CARTRIDGE_PATH = 'cartridge.js';
const HEADER_REGEX = /^\s*\/\/\s*(title|author|desc|script|input|saveid):.*/i;

class Tic80Plugin {
    /**
     * @param {Object} options
     * @param {string} [options.cartridgePath]
     */
    constructor(options = {}) {
        validateOptions(SCHEMA, options, { name: PLUGIN_NAME });
        this.options = options;
    }

    apply(compiler) {
        const cartridgePath = this.options.cartridgePath || DEFAULT_CARTRIDGE_PATH;
        compiler.hooks.compilation.tap(PLUGIN_NAME, compilation => {
            compilation.hooks.optimizeChunkAssets.tapAsync(PLUGIN_NAME, (chunks, done) => {
                /** @type {string[]} */
                const lines = [];
                const lineReader = readline.createInterface(fs.createReadStream(path.resolve(compiler.context, cartridgePath), 'utf-8'));

                lineReader.on('line', (line) => {
                    lines.push(line);
                });

                lineReader.on('close', () => {
                    const headerLines = lines.filter(line => HEADER_REGEX.test(line));
                    const footerLines = lines.filter(line => !HEADER_REGEX.test(line));

                    headerLines.push('\n');
                    footerLines.unshift('\n');

                    wrapChunks(compilation, chunks, headerLines, footerLines);
                    done();
                });
            });
        });
    }
}

/**
 * @param {any} compilation
 * @param {any[]} chunks
 * @param {string[]} headerLines
 * @param {string[]} footerLines
 */
function wrapChunks(compilation, chunks, headerLines, footerLines) {
    for (const chunk of chunks) {
        if (!chunk.rendered) {
            // Skip already rendered (cached) chunks
            // to avoid rebuilding unchanged code.
            continue;
        }

        for (const fileName of chunk.files) {
            wrapFile(compilation, fileName, headerLines, footerLines);
        }
    }
}

/**
 * @param {any} compilation
 * @param {string} fileName
 * @param {string[]} headerLines
 * @param {string[]} footerLines
 */
function wrapFile(compilation, fileName, headerLines, footerLines) {
    compilation.assets[fileName] = new ConcatSource(
        String(headerLines.join('\n')),
        compilation.assets[fileName],
        String(footerLines.join('\n'))
    );
}

module.exports = Tic80Plugin;