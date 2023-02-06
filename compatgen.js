const child_process = require('child_process');
const filesystem = require('fs');
const readline = require('readline');
const args = process.argv;

// ## CONFIGURATION / INPUT ##
const defaultCompatFile = 'natives_global_client_compat.lua';

let nextVersion = [ 2, 0 ];
let forceUpdate = false;
let inputFile = defaultCompatFile;
let ignoreMissingInputFile = false;
let outputFile = defaultCompatFile;
let useHistory = false;
let startDate = "2023-01-01";
let startTimestamp = new Date(startDate).getTime();

for (let i = 2; i < args.length; ++i)
{
	const arg = args[i];
	if (arg[0] === '-')
	{
		if (arg[1] === '-')
		{
			const delimeter = arg.search('=');
			const option = arg.slice(2, delimeter);
			const val = arg.slice(delimeter + 1);
			switch(option)
			{
			case 'in':
				inputFile = val === "skip" ? null : val;
				continue;
			case 'out':
				outputFile = val === "skip" ? null : val;
				continue;
			case 'set-version':
				nextVersion = val.match(/\d+/g);
				if (nextVersion && (nextVersion.length == 2 || nextVersion.length == 4))
				{
					for (let v = 0; v < nextVersion.length; ++v)
					{
						if ((nextVersion[v] = parseInt(nextVersion[v])) >= 65535)
						{
							process.stderr.write(option + " contains at least 1 number that isn't < 65535\n");
							process.exit(2);
						}
					}
				}
				else
				{
					process.stderr.write("Invalid value for " + option + " with value: '" + val + "', must be either 2 or 4 integers\n");
					process.exit(2);
				}
				continue;
			case 'start-date':
				startDate = val;
				startTimestamp = new Date(startDate).getTime();
				continue;
			case 'force':
				forceUpdate = !(val == false || val === "false");
				continue;
			case 'use-history':
				useHistory = !(val == false || val === "false");
				continue;
			case 'ignore-missing-in':
				ignoreMissingInputFile = !(val == false || val === "false");
				continue;
			}
		}
		else // shorthands
		{			
			for (let o = 1; o < arg.length; ++o)
			{
				switch(arg[o])
				{
				case 'f':
					forceUpdate = true;
					break;
				case 'h':
					useHistory = true;
					break;
				case 'i':
					ignoreMissingInputFile = true;
					break;
				default:
					process.stderr.write("Unknown short option '" + arg[o] + "'\n");
					process.exit(2);
				}
			}
			
			continue;
		}
	}
	else if(arg === 'help')
	{
		process.stderr.write(
`Usage: node compatgen.js [--in] [--out] [--force | -f] [--next-version] [--start-date] [--use-history | -h]

Note: execute this file inside of the git repository from which you want native declarations for.

  --in          Previous output file to start from, check, and append changes to.
                  --in=path/to/file.lua | --in=skip
                    default: ` + defaultCompatFile + `

  --out         File to create/write but only if there are changes, see -force.
                  --out=path/to/file.lua | --out=skip
                    default: ` + defaultCompatFile + `

  --force | -f  Ignores the changes check and writes the output file anyway.
                  --force[=true|false|1|0]
                    default: false

  --set-version
                The version(ing) to mark the output file with. Automatically
                sets build and revision by days since -start-date and changes
                on that day.
                  --set-version=2.0      : set major and minor, auto the rest.
                  --set-version=2.0.3.4  : force the use of this exact version.
                    default: 2.0

  --start-date
                Date from when the build number (days since) starts counting,
                in YYYY-MM-DD fortmat. Also used as the start date when combined
                with --use-history.
                  --start-date=2023-01-01
                    default: 2023-01-01

  --use-history | -h
                Uses the 'git log' command to grab all signatures from history,
                when false it only checks the latest commit. This requires quite
                a depthful checkout from git. Also see --start-date.
                  --use-history[=true|false|1|0]
                    default: false

  --ignore-missing-in | -i
                Use this when the --in supplied file is or might be non-existing
                and you want to ignore its loading instead of giving an error.
                  --ignore-missing-in[=true|false|1|0]
                    default: false

  help          This help screen.\n`);
  
		process.exit(0);
	}
	
	process.stderr.write("Unknown argument '" + arg + "', please remove this one.\n");
	process.exit(2);
}

// ## CODE GENERATION ##
// beware of changing anything below

const valType = 'ulong';
const refType = 'ulong*';

// used as overrides
const wrapperTypesOverride = {
	false: // by value
	{
		'void': 'void',
		'object': 'object',
		'Vector3': 'Vector3',
	},
	true: // by ref (pointer)
	{
		'char': 'string',
		'Vector3': 'Vector3*',
	}
};

function WrapType(typ, isPointer)
{
	return wrapperTypesOverride[isPointer][typ]
		|| (isPointer ? refType : valType);
}

function WrapTypes(returnType, returnIsPtr, parameterString)
{
	// get parameter type and replace it with the wrapper type
	let types = [ WrapType(returnType, returnIsPtr != '') ];
	if (WrapType(returnType, returnIsPtr != '') == null) console.log(returnType + " " + returnIsPtr);
	
	const regexp = /(\w+)(\*?)\s\w+/g;
	while ((match = regexp.exec(parameterString)) !== null)
	{
		let [_, typ, ptr] = match;
		typ = WrapType(typ, ptr != '');
		
		if (typ === "Vector3") // technically just 3 floats that'll be saved in 3 64 bit slots
		{
			types.push(valType, valType, valType);
		}
		else
		{
			types.push(typ);
		}
	}
	
	return types;
}

function ArraysEqual(left, right)
{
	const size = left.length;	
	if (size !== right.length)
	{
		return false;
	}
	
	for (let i = 0; i < size; ++i)
	{
		if (left[i] !== right[i])
		{
			return false;
		}
	}
	
	return true;
}

function InsertIfNotExisting(arr, types)
{
	let size = arr.length;
	for (let i = 0; i < size; ++i)
	{
		if (ArraysEqual(types, arr[i]))
		{
			return false;
		}
	}
	
	arr.push(types);
	
	return true;
}

async function ParsePreviousLuaCompatibilityFile()
{
	const natives = new Map();
	let version = [ 0, 0, 0, 0 ];
	let currentNative = null, changes = 0, lineNumber = 0;
	
	if (inputFile)
	{	
		if (filesystem.existsSync(inputFile))
		{		
			const lineReader = readline.createInterface({
				input: filesystem.createReadStream(inputFile),
				output: null,
				console: false
			});
			
			for await (const line of lineReader)
			{
				++lineNumber;
				
				if ((match = line.match(/^\s*([[{}]|\w+)/)) !== null)
				{
					switch (match[1])
					{
					case '{': // new signature
						if (currentNative !== null)
						{
							if ((typeMatch = line.match(/(?<=[,{]\s*")[^"]*/g)) !== null)
							{
								currentNative.push(typeMatch);
							}
							else
							{
								process.stderr.write("Unexpected Lua format, expecting a Lua array with strings, on line " + lineNumber + ", got `" + line + "`\n");
								process.exit(4);
							}
							
							++changes;
						}
						else
						{
							process.stderr.write("Unexpected Lua format, found a new signature but we aren't in any method group, on line " + lineNumber + ", got `" + line + "`\n");
							process.exit(5);
						}
						break;
					case '[':
						if ((hashMatch = line.match(/0[xX][0-9a-fA-F]+/)) !== null)
						{
							natives.set(BigInt(hashMatch[0]), currentNative = []);
						}
						else
						{
							process.stderr.write("Unexpected Lua format, expecting a hex value on line " + lineNumber + ", got `" + line + "`\n");
							process.exit(6);
						}
						break;
					case '}':
						currentNative = null;
						break;
					case 'version':
						version = line.match(/\d+/g).map(Number);
						break;
					}
				}
			}
		}
		else if (!ignoreMissingInputFile)
		{
			process.stderr.write("Input file '" + inputFile + "' not found, stopping execution. If required use the --ignore-missing-in option to continue on another attempt.\n");
			process.exit(3);
		}
	}
		
	return [ natives, version, changes ];
}

async function ParseFunctionHistory(natives)
{
	return new Promise((resolve, reject) =>
	{
		natives = natives || new Map();
		let newCompatFunctions = 0;
		
		// we'll all sgnatures, including added and removed
		// 
		// operation in order:
		//   git log -G         get all commits with a c style function signature (with added "cs_type(*)" recognition - or -
		//   git diff-tree      get changes in latest commit, needs fetch-depth of at least 2
		//
		//   sed                get lines between "```c" and "```", properly handling "-```" lines
		//   grep -Po           filter for native's hexadecimal and all signatures
		//   sed                remove all "cs_type(*) " and "const "
		
		const gitHistory = child_process.spawn(
			(useHistory
				? String.raw`git log -p -G"^(cs_type\(.+\)[ \t])?\w+[ \t]\w+\(.*\)" --oneline --pretty= --after="` + startDate + `"`
				: "git diff-tree HEAD --cc --oneline --pretty= "
			) +
			/*      */" | sed -n -e '/[+ ]```c$/,/[+ ]```/{/```$/!p}'" +
			String.raw` | grep -Po "(//\s0x\w*|(^[+-](cs_type\(\w*\)[ \t])?\w+[ \t]\w+\(.*\);?))"` +
			String.raw` | sed -E "s/(cs_type\(\w*\*?\) )|const //Ig"`, { shell: true });
		
		gitHistory.stdout.on('data', (data) =>
		{			
			const regexStart = /\/\/\s[^/]*/g;
			const regexHash = /\/\/\s(0x\w+)/;
			const regexMethod = /[+-](\w+)(\*?)\s+[\w_]+\s?\((.*?)\)/g;
			
			while ((match = regexStart.exec(data.toString())) !== null)
			{
				const curLine = match[0];
				if (curLine != "")
				{			
					// not supporting hash-less functions
					if ((hashMatch = regexHash.exec(curLine)) !== null)
					{
						const hash = BigInt(hashMatch[1]);
						
						let curNative = natives.get(hash);
						if (!curNative)
						{
							natives.set(hash, curNative = []);
						}
						
						while ((signatureMatch = regexMethod.exec(curLine)) !== null)
						{
							const [_, result, ptr, parameters] = signatureMatch;
							if (InsertIfNotExisting(curNative, WrapTypes(result, ptr, parameters)))
							{
								++newCompatFunctions;
							}
						}
					}
				}
			}
		});
		
		gitHistory.on('close', () => resolve([ natives, newCompatFunctions ]));
	});
}

(async function()
{
	try
	{
		const [ prevNatives, prevVersion, prevCompatChanges ] = await ParsePreviousLuaCompatibilityFile();
		process.stdout.write("Loaded " + prevNatives.size + " previous native signatures.\n");
		
		// the version with 4 elements will override the normal counting
		if (nextVersion.length != 4)
		{
			const daysSinceStart = Math.floor((Date.now() - startTimestamp) / (1000 * 60 * 60 * 24));			
			nextVersion[2] = daysSinceStart;
			nextVersion[3] = daysSinceStart === prevVersion[2] ? prevVersion[3] + 1 : 0;
		}
		
		const [ natives, newCompatFunctions ] = await ParseFunctionHistory(prevNatives);
		
		if (outputFile && (forceUpdate || newCompatFunctions > 0))
		{
			var file = filesystem.createWriteStream(outputFile, { flags: 'w' });

			file.write("-- Auto-generated file --\n-- Follow the below syntax explicitly if manually editing, as we use a simplified Lua parser that expects this syntax.\n\n");
			file.write("version = { " + nextVersion.join(', ') + " }\n");
			file.write("compatibility = {\n");

			for (const [hash, signatures] of natives)
			{
				file.write('[0x' + hash.toString(16) + "] = {\n");
				
				for (let i = 0; i < signatures.length; ++i)
				{
					const types = signatures[i];
					file.write('\t{ "' + types[0] + '"');
					
					for (let t = 1; t < types.length; ++t)
					{
						file.write(', "' + types[t] + '"');
					}
					
					file.write(" },\n");
				}
				
				file.write("},\n");
			}

			file.write("}\n");

			file.end();
			file.close();
			
			
			process.stdout.write(newCompatFunctions + " change(s) found, compatibility file generated at '" + outputFile + "'\n");
			//process.exit(0);
			return;
		}
		
		process.stdout.write(newCompatFunctions + " change(s) found, skipped compatibility file generation.\n");
	}
	catch(exc)
	{
		process.stderr.write(exc.stack.toString() + "\n");
		process.exit(1);
	}
})();