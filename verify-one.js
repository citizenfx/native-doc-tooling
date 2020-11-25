const fs = require('fs');
const unified = require('unified');
const frontmatter = require('remark-frontmatter');
const rpm = require('remark-parse-yaml');
const rp = require('remark-parse');
const minimatch = require('minimatch');

const makeNative = require('./native-compiler');

require('node-json-color-stringify');

const processor = unified()
    .use(rp)
    .use(frontmatter)
    .use(rpm)
    .use(makeNative)
    .freeze();

if (process.argv.length <= 2) {
    process.exitCode = 2;
    return;
}

const input = process.argv[2];
const createMatcher = (file) => (pattern) => minimatch(file, pattern, { matchBase: true });

try {
    if (!['.*', '!*.md', 'README.md'].some(createMatcher(input))) {
        const nativeData = processor
            .processSync(fs.readFileSync(input));

        if (nativeData.result.hash === '0x0') {
            throw new Error('No native hash was specified.');
        }

        console.log(JSON.colorStringify(nativeData.result, null, 4));
    } else {
        console.log(`${input} is not a native definition.`);
    }

    process.exitCode = 0;
} catch (e) {
    console.log(e);

    process.exitCode = 1;
}
