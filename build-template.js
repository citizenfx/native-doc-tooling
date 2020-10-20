const fs = require('fs');
let natives = JSON.parse(fs.readFileSync('natives_test.json'));

const Twing = require('twing');
const { TokenType } = require('twig-lexer');

const loader = new Twing.TwingLoaderFilesystem(__dirname + '/views/');

const env = new Twing.TwingEnvironment(loader, {
    autoescape: false
});

const objectify = (obj, [k, v]) => ({ ...obj, [k]: v });

env.addFilter(new Twing.TwingFilter('cast_to_array', async input => input));
env.addFilter(new Twing.TwingFilter('normalize_type', async input => input.replace(/\*/g, 'Ptr')));
env.addFilter(new Twing.TwingFilter('strip_author', async input => input));
env.addFilter(new Twing.TwingFilter('indent', async input => input));
env.addFilter(new Twing.TwingFilter('sort_array', async input => {
    return Object.entries(input).sort(([a], [b]) => {
        const aKey = (a === 'CFX') ? 'AAAAAAACFX' : a;
        const bKey = (b === 'CFX') ? 'AAAAAAACFX' : b;

        return aKey.localeCompare(bKey);
    }).reduce(objectify, {});
}));
env.addFilter(new Twing.TwingFilter('sort_name', async input => {
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

env.addFilter(new Twing.TwingFilter('makenative', async input => {
    return input.toLowerCase().replace('0x', 'n_0x')
        .replace(/_([a-z])/g, (sub, bit) => bit.toUpperCase())
        .replace(/^([a-z])/, (sub, bit) => bit.toUpperCase());
}));

env.addFilter(new Twing.TwingFilter('pascalcase', async input => input.replace(/(?:\s|^)([a-z])/g, (sub, reg) => reg.toUpperCase())));

const remark = require('remark');
const html = require('remark-html');
const highlight = require('remark-highlight.js');

env.addFilter(new Twing.TwingFilter('mdify', async input => {
    return remark()
        .use(highlight)
        .use(html)
        .processSync(input)
        .toString();
}));

env.addFilter(new Twing.TwingFilter('nop', async input => {
    return input.replace(/<\/?p>/g, '');
}));

// exports.TwingToken = require('./twing/token').TwingToken;

class CodeBlockNode extends Twing.TwingNode {
    constructor(body, line, tag) {
        super(new Map([[ 'body', body ]]), {}, line, tag);
    }

    compile(compiler) {
        compiler.write('let highlighter = this.environment.extensionSet.getExtension("CodeBlockHighlighter");\n');

        compiler.write('outputBuffer.start();\n');
        compiler.subcompile(this.getNode('body'));
        compiler.write('let body = outputBuffer.getAndClean();\n');

        compiler.write('let code = highlighter.highlight(body);\n');
        
        compiler.write('outputBuffer.echo(`<figure class="code"><pre><code>${code}</code></pre></figure>`);');
    }
}

class CodeBlockTokenParser extends Twing.TwingTokenParser {
    parse(token) {
        const parser = this.parser;
        const stream = parser.getStream();

        while (!stream.getCurrent().test(TokenType.TAG_END)) {
            this.parseEncounteredToken(stream.getCurrent(), stream);
        }

        stream.expect(TokenType.TAG_END);

        // seriously, PHP-like callables?!
        const body = parser.subparse([this, this.decideBlockEnd], true);

        stream.expect(TokenType.TAG_END);

        return new CodeBlockNode(body, token.line, this.getTag());
    }

    parseEncounteredToken(token, stream) {
        // TODO
    }

    decideBlockEnd(token) {
        return token.test(TokenType.NAME, 'endcodeblock');
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

(async() => {
try {
    const out = await env.render(templateName + '.twig', { natives });
    process.stdout.write(out);
} catch (e) {
    console.error(e);
    process.exit(1);
}
})();