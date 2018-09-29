const fs = require('fs');
const heading = require('mdast-util-heading-range');
const cast = require('./c-ast');
const tmp = require('tmp');
const unified = require('unified');
const stringify = require('remark-stringify');
const htmlify = require('remark-html');

class ParseError extends Error {};

module.exports = compileNative;

function compileNative() {
    this.Compiler = runCompile;
}

function runCompile(ast) {
    function findOfType(node, type, cb) {
        if (Array.isArray(node)) {
            for (const inner of node) {
                findOfType(inner, type, cb);
            }
    
            return;
        }
        
        if (node.type === type) {
            cb(node);
        }
        
        if (node.children !== undefined) {
            findOfType(node.children, type, cb);
        }
    }
    
    function findList(node, cb) {
        return findOfType(node, 'list', cb);
    }

    let yamlData = {};

    findOfType(ast, 'yaml', (node) => {
        yamlData = node.data.parsedValue;
    })
    
    const native = {
        name: '',
        params: [],
        results: [],
        description: '',
        examples: [],
        hash: '0x0',
        ...yamlData
    };

    let code = '';
    
    findOfType(ast, 'code', (node) => {
        if (node.lang === 'c') {
            code = node.value;
        }
    })
    
    if (code === '') {
        throw new ParseError('No C code definition.');
    }
    
    const header = fs.readFileSync(__dirname + '/c_header.h');
    
    const codeFile = tmp.fileSync({ postfix: '.cpp' });
    fs.writeFileSync(codeFile.name, header + "\n" + code);
    
    const cAst = cast(codeFile.name);

    codeFile.removeCallback();
    
    if (cAst.Functions.length !== 1) {
        throw new ParseError('C code snippet contained wrong amount of functions.');
    }
    
    const cFunc = cAst.Functions[0];

    native.name = cFunc.Name;
    native.results = cFunc.Return.trim().replace(' *', '*');
    native.params = cFunc.Parameters.map(({ name, type }) => ({ name, type: type.replace(' *', '*') }));
    
    function hashString(key) {
        var hash = 0, i = key.length;
    
        while (i--) {
            hash += key.charCodeAt(key.length - i - 1);
            hash += (hash << 10);
            hash ^= (hash >>> 6);
        }
        
        hash += (hash << 3);
        hash ^= (hash >>> 11);
        hash += (hash << 15);
    
        return hash >>> 0;
    }
    
    native.hash = '0x' + hashString(native.name.toLowerCase()).toString(16).toUpperCase();
    
    const commentHash = code.match(/\/\/\s+0x([0-9A-F]{1,16})(?:\s+0x([0-9A-F]{1,8}))?/i);
    
    if (commentHash) {
        native.hash = '0x' + commentHash[1];
    
        if (commentHash[2]) {
            native.jhash = '0x' + commentHash[2];
        }

        native.manualHash = true;
    }
    
    heading(ast, 'parameters', (_, nodes) => {
        const lists = [];
    
        findList(nodes, (list) => {
            lists.push(list);
        });
    
        if (lists.length === 0) {
            throw new ParseError('No parameter list in "Parameters" heading.');
        }
    
        findOfType(lists[0], 'listItem', (item) => {
            const paras = [];
    
            findOfType(item, 'paragraph', (para) => {
                paras.push(para);
            });
    
            if (paras.length !== 1) {
                throw new ParseError('A parameter can only have one paragraph.');
            }
    
            const para = paras[0];
            let name = '';
    
            findOfType(para, 'strong', (item) => {
                if (name === '') {
                    name = item.children[0].value;
                }
            });
    
            if (name === '') {
                throw new ParseError('A parameter must have a name.');
            }
    
            const others = para.children.slice(1);
            if (others[0].value) {
                others[0].value = others[0].value.replace(/^: /, '');
            }

            const def = unified().use(stringify).stringify({
                type: 'paragraph',
                children: others
            }).trim();
    
            const paraRef = native.params.find(p => p.name === name);
    
            if (!paraRef) {
                throw new ParseError('A parameter definition was found for a parameter that does not exist. Parameter name: ' + name);
            }
    
            if (def.length > 0) {
                paraRef.description = def;
            }
        })
    });
    
    heading(ast, 'return value', (_, nodes) => {
        native.resultsDescription = unified().use(stringify).stringify({
            type: 'paragraph',
            children: nodes
        }).trim();
    });
    
    heading(ast, native.name, (_, nodes) => {
        const para = {
            type: 'paragraph',
            children: nodes.filter(a => a.type !== 'code' || (a.type === 'code' && a.lang !== 'c'))
        };

        native.description = unified().use(stringify, { fences: true }).stringify(para).trim();
    });
    
    heading(ast, 'examples', (_, nodes) => {
        findOfType(nodes, 'code', (code) => {
            native.examples.push({
                lang: code.lang,
                code: code.value
            })
        });
    });

    if (native.name.startsWith('_0x')) {
        delete native.name;
    }

    return native;
}