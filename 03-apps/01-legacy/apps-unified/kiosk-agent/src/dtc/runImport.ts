import { resolve } from 'node:path';
import { importDtcPackage, DtcImportError } from './importer.js';

interface CliOptions {
	archive?: string;
	signature?: string;
	key?: string;
	database?: string;
	cache?: string;
	source?: string;
	allowUnsigned: boolean;
}

function parseArgs(argv: string[]): CliOptions {
	const options: CliOptions = { allowUnsigned: false };
	const readValue = (name: string, currentIndex: number): string => {
		const value = argv[currentIndex + 1];
		if (!value) {
			throw new Error(`Missing value for ${name}`);
		}
		return value;
	};

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		switch (token) {
			case '--archive':
			case '-a':
				options.archive = readValue(token, index);
				index += 1;
				break;
			case '--signature':
			case '-s':
				options.signature = readValue(token, index);
				index += 1;
				break;
			case '--key':
			case '-k':
				options.key = readValue(token, index);
				index += 1;
				break;
			case '--database':
			case '-d':
				options.database = readValue(token, index);
				index += 1;
				break;
			case '--cache':
				options.cache = readValue(token, index);
				index += 1;
				break;
			case '--source':
				options.source = readValue(token, index);
				index += 1;
				break;
			case '--allow-unsigned':
				options.allowUnsigned = true;
				break;
			case '--help':
			case '-h':
				printHelp();
				process.exit(0);
				break;
			default:
				throw new Error(`Unknown argument: ${token}`);
		}
	}
	return options;
}

function printHelp(): void {
	console.log('Usage: node --loader ts-node/esm src/dtc/runImport.ts --archive <file> --signature <file> --key <file>');
	console.log('Options:');
	console.log('  --archive, -a     Path to .obdresource archive');
	console.log('  --signature, -s   Path to detached signature (required unless --allow-unsigned)');
	console.log('  --key, -k         Path to Ed25519 public key (required unless --allow-unsigned)');
	console.log('  --database, -d    Path to SQLite database (optional)');
	console.log('  --cache           Cache directory for imported artifacts (optional)');
	console.log('  --source          Source tag to store in dtc_packages.source (default: manual)');
	console.log('  --allow-unsigned  Allow import without signature verification (DEV only)');
}

async function main(): Promise<void> {
	try {
		const args = parseArgs(process.argv.slice(2));
		if (!args.archive) {
			throw new Error('Missing required argument --archive');
		}
		if (!args.allowUnsigned) {
			if (!args.signature) {
				throw new Error('Missing required argument --signature');
			}
			if (!args.key) {
				throw new Error('Missing required argument --key');
			}
		}

		const result = await importDtcPackage({
			archivePath: resolve(args.archive),
			signaturePath: args.signature ? resolve(args.signature) : undefined,
			publicKeyPath: args.key ? resolve(args.key) : undefined,
			databasePath: args.database ? resolve(args.database) : undefined,
			cacheDir: args.cache ? resolve(args.cache) : undefined,
			source: args.source,
			allowUnsigned: args.allowUnsigned,
		});

		console.log('Import completed');
		console.log(`  packageId: ${result.packageId}`);
		console.log(`  version: ${result.version}`);
		console.log(`  records: ${result.recordsImported}`);
		console.log(`  brands: ${result.brandsProcessed}`);
		console.log(`  database: ${result.databasePath}`);
		console.log(`  manifest cached: ${result.manifestPath}`);
	} catch (error) {
		if (error instanceof DtcImportError) {
			console.error(`Import failed: ${error.message}`);
		} else if (error instanceof Error) {
			console.error(`Unexpected error: ${error.message}`);
		} else {
			console.error('Unknown error');
		}
		process.exit(1);
	}
}

main();
