const fs = require('fs');

/*const unified = require('unified');
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

const nativeData = processor
        .processSync(fs.readFileSync(process.argv[2]));

console.log(nativeData);

return;*/

const recursive = require('recursive-readdir');

const natives = {};

const workerFarm = require('worker-farm');
const workers = workerFarm(require.resolve('./worker'));

let ret = 0;

recursive(process.argv[2], (err, files) => {
    for (const file of files) {
        if (!file.endsWith('.md') || file.endsWith('README.md')) {
            ++ret;
            continue;
        }

        workers(file, (err, nativeData) => {
            if (err) {
                console.log(err);
                process.exit(0);
                return;
            }

            const native = nativeData.contents;

            if (!natives[native.ns]) {
                natives[native.ns] = {};
            }

            natives[native.ns][native.hash] = native;

            //console.log(native.name || native.hash);
            process.stdout.write(`\r${ret}/${files.length} - ${native.name || native.hash}                                                     `)

            ++ret;

            if (ret >= files.length) {
                console.log('\nDone!');

                fs.writeFileSync('natives_test.json', JSON.stringify(natives));
                workerFarm.end(workers);
            }
        });
    }
});

//const ast = remark.parse(fileData);
//console.log(ast);

//const native = nativeData.contents;

//console.log(JSON.stringify(native, null, 4));