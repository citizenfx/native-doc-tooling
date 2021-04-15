const fs = require('fs');
const recursive = require('recursive-readdir');

const { SitemapStream, streamToPromise } = require( 'sitemap' )
const { Readable } = require( 'stream' )

const links = [];

const workerFarm = require('worker-farm');
const workers = workerFarm(require.resolve('./worker'));

let ret = 0;

recursive(process.argv[2], ['.*', '!*.md','README.md'], (err, files) => {
    for (const file of files) {
        workers(file, (err, nativeData) => {
            if (err) {
                console.log(err);
                process.exit(0);
                return;
            }
            
            const mtime = fs.statSync(file).mtime;

            const native = nativeData.result;
            links.push({
				url: 'https://docs.fivem.net/natives/?_' + native.hash,
				lastmod: mtime.toISOString()
            });

            process.stderr.write(`\r${ret}/${files.length} - ${native.name || native.hash}                                                     `)

            ++ret;

            if (ret >= files.length) {
                process.stderr.write('\nDone!');

				const stream = new SitemapStream( { hostname: 'https://docs.fivem.net/natives/' } );
				
				streamToPromise(Readable.from(links).pipe(stream)).then((data) => data.toString()).then((str) => console.log(str));
                
                workerFarm.end(workers);
            }
        });
    }
});