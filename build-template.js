const fs = require('fs');
let natives = JSON.parse(fs.readFileSync('natives_test.json'));

const Twing = require('twing');

const loader = new Twing.TwingLoaderFilesystem(__dirname + '/views/');

const env = new Twing.TwingEnvironment(loader, {
    autoescape: false
});

const objectify = (obj, [k, v]) => ({ ...obj, [k]: v });

env.addFilter(new Twing.TwingFilter('cast_to_array', input => input));
env.addFilter(new Twing.TwingFilter('normalize_type', input => input.replace(/\*/g, 'Ptr')));
env.addFilter(new Twing.TwingFilter('strip_author', input => input));
env.addFilter(new Twing.TwingFilter('indent', input => input));
env.addFilter(new Twing.TwingFilter('sort_array', input => {
    return Object.entries(input).sort(([a], [b]) => {
        const aKey = (a === 'CFX') ? 'AAAAAAACFX' : a;
        const bKey = (b === 'CFX') ? 'AAAAAAACFX' : b;

        return aKey.localeCompare(bKey);
    }).reduce(objectify, {});
}));
env.addFilter(new Twing.TwingFilter('sort_name', input => {
    return Object.entries(input).sort(([_, a], [_b, b]) => {
        // JS compare makes _ first, so sort order:
        // - a-z
        // - _a-z
        // - _hash
        let aName = (a.name) ? a.name : 'zz_zz' + a.hash;
        let bName = (b.name) ? b.name : 'zz_zz' + b.hash;

        if (aName.startsWith('_')) {
            aName = `zz${aName}`;
        }

        if (bName.startsWith('_')) {
            bName = `zz${bName}`;
        }

        return aName.localeCompare(bName)
    }).reduce(objectify, {});
}));

env.addFilter(new Twing.TwingFilter('makenative', input => {
    return input.toLowerCase().replace('0x', 'n_0x')
        .replace(/_([a-z])/g, (sub, bit) => bit.toUpperCase())
        .replace(/^([a-z])/, (sub, bit) => bit.toUpperCase());
}));

env.addFilter(new Twing.TwingFilter('pascalcase', input => input.replace(/(?:\s|^)([a-z])/g, (sub, reg) => reg.toUpperCase())));

const remark = require('remark');
const html = require('remark-html');
const highlight = require('remark-highlight.js');

env.addFilter(new Twing.TwingFilter('mdify', input => {
    return remark()
        .use(highlight)
        .use(html)
        .processSync(input)
        .toString();
}));

env.addFilter(new Twing.TwingFilter('nop', input => {
    return input.replace(/<\/?p>/g, '');
}));

// exports.TwingToken = require('./twing/token').TwingToken;

class CodeBlockNode extends Twing.TwingNode {
    constructor(body, line, tag) {
        super(new Map([[ 'body', body ]]), {}, line, tag);
    }

    compile(compiler) {
        compiler.addDebugInfo(this);

        compiler.write('let highlighter = this.extensions.get("CodeBlockHighlighter");\n');

        compiler.write('Twing.obStart();\n');
        compiler.subcompile(this.getNode('body'));
        compiler.write('let body = Twing.obGetClean();\n');

        compiler.write('let code = highlighter.highlight(body);\n');
        
        compiler.write('Twing.echo(`<figure class="code"><pre><code>${code}</code></pre></figure>`);');
    }
}

class CodeBlockTokenParser extends Twing.TwingTokenParser {
    parse(token) {
        const parser = this.parser;
        const stream = parser.getStream();

        while (!stream.getCurrent().test(Twing.TwingToken.BLOCK_END_TYPE)) {
            this.parseEncounteredToken(stream.getCurrent(), stream);
        }

        stream.expect(Twing.TwingToken.BLOCK_END_TYPE);

        // seriously, PHP-like callables?!
        const body = parser.subparse([this, this.decideBlockEnd], true);

        stream.expect(Twing.TwingToken.BLOCK_END_TYPE);

        return new CodeBlockNode(body, token.getLine(), this.getTag());
    }

    parseEncounteredToken(token, stream) {
        // TODO
    }

    decideBlockEnd(token) {
        return token.test(Twing.TwingToken.NAME_TYPE, 'endcodeblock');
    }

    getTag() {
        return 'codeblock';
    }
}

const hljs = require('highlight.js');

class CodeBlockHighlighter extends Twing.TwingExtension {
    highlight(str) {
        return hljs.highlight('c', str).value;
    }
}

env.addTokenParser(new CodeBlockTokenParser());
env.addExtension(new CodeBlockHighlighter(), 'CodeBlockHighlighter');

const templateName = process.argv.length >= 3 ? process.argv[2] : 'lua';

if (process.argv.length >= 4 && process.argv[3] == 'CFX') {
	natives = { CFX: natives.CFX };
}

try {
    const out = env.render(templateName + '.twig', { natives });
    process.stdout.write(out);
} catch (e) {
    console.error(e);
    process.exit(1);
}