const fs = require('fs');
const unified = require('unified');
const frontmatter = require('remark-frontmatter');
const rpm = require('remark-parse-yaml');
const rp = require('remark-parse');

const makeNative = require('./native-compiler');

const processor = unified()
    .use(rp)
    .use(frontmatter)
    .use(rpm)
    .use(makeNative)
    .freeze();

module.exports = (input, cb) => {
    try {
        const nativeData = processor
            .processSync(fs.readFileSync(input));

        cb(null, nativeData);
    } catch (e) {
        cb(`Failed on ${input} with error ${e.toString()}`);
    }
};
