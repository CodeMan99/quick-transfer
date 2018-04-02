#!/usr/bin/env node

'use strict';

const chalk = require('chalk');
const createDebug = require('debug');
const debug = createDebug('quick-transfer:cli');
const display = require('./display-url.js');
const fastGlob = require('fast-glob');
const fs = require('fs');
const internalIP = require('internal-ip');
const mime = require('mime-types');
const minimist = require('minimist');
const net = require('net');
const parseAuthor = require('parse-author');
const path = require('path');
const pkg = require('./package.json');
const serveOnce = require('./serve-once.js');
const Stats = require('stats-ctor');
const StatStream = require('./stat-stream.js');
const Vinyl = require('vinyl');
const yazl = require('yazl');
const colors = {
	error: chalk.red,
	warning: chalk.magenta,
	info: chalk.green
};
const S_IFREG = 0o100000; // fs.constants.S_IFREG which is not available in node v4.x

if (require.main === module) {
	process.title = 'quick-transfer';
	process.exitCode = 0;
	main(process.argv.slice(2), err => {
		if (err) {
			if (debug.enabled && err.origianl) err = err.original;

			process.exitCode = Math.max(err.exitCode || 1, process.exitCode);

			err.message && console.error(colors.error(err.message));
			debug.enabled && err.stack && console.error(err.stack);
			!err.message && !err.stack && console.error(err);

			return;
		}

		process.exitCode = Math.max(0, process.exitCode);
	});
}

function main(argv, callback) {
	const options = minimist(argv, {
		alias: {
			a: 'address',
			d: 'display',
			e: 'extension',
			f: 'filename',
			g: 'glob',
			p: 'port',
			t: 'type',
			h: 'help',
			v: 'verbose'
		},
		'default': {
			address: '0.0.0.0',
			glob: false,
			port: '0'
		},
		boolean: [
			'help',
			'glob',
			'verbose',
			'version'
		],
		string: [
			'address',
			'display',
			'extension',
			'filename',
			'port',
			'type'
		]
	});
	const filenames = options._.slice();
	const ready = (err, file) => {
		if (err) return callback(err);

		const server = serveOnce(file, (sErr, info) => {
			callback(sErr);
			debug('server stopped %O', info);
		});

		server.listen(parseInt(options.port, 10) || 0, net.isIPv4(options.address) ? options.address : '0.0.0.0', () => {
			const binding = server.address();
			const address = binding.address;
			const port = binding.port;

			let result = null;

			debug('server listening on %s:%s', address, port);

			if (net.isIPv4(options.display)) {
				result = display(options.display, port, file);
			} else if (address === '0.0.0.0' || address === '127.0.0.1') {
				debug('getting internal IP because address is a loopback device');

				result = internalIP.v4().then(ip => {
					return display(ip, port, file);
				});
			} else {
				result = display(address, port, file);
			}

			result.then(show => {
				console.log(colors.info(show.uri));
				console.log(show.qrcode);
			}).catch(rErr => {
				const displayError = new Error('Unable to create URI or QR code');

				displayError.original = rErr;

				// there should not be any socket connections open at this point... hopefully
				server.removeAllListeners();
				server.close();
				file.contents.destroy();

				callback(displayError);
			});
		});
	};

	if (options.version) {
		version();
		callback(null);

		return;
	}

	if (options.help) {
		usage();
		callback(null);

		return;
	}

	if (options.verbose) {
		createDebug.enable('quick-transfer:*');
		debug('verbose mode enabled');
	}

	if (options.type) {
		options.extension && console.error(colors.warning('Warning: both --extension and --type provided, respecting only --type'));
		options.extension = mime.extension(options.type) || options.extension;
		debug('type parsed to extension "%s"', options.extension);
	}

	if (filenames.length === 0) {
		doStdin(options, ready);
	} else if (filenames.length === 1 && !options.glob) {
		doSingleFile(filenames[0], options, ready);
	} else {
		doMultipleFiles(filenames, options, ready);
	}
}

function usage() {
	console.log(/* eslint-disable indent */
`
  $ ${colors.info('quick-transfer')} [files]

    -a, --address <IPv4>      IP address for the server to bind on when listening
                              for requests
    -d, --display <IPv4>      IP address to use as host part of the displayed URL
    -e, --extension <name>    Override file extension.
    -f, --filename <name>     Override filename. Default "stdin.txt" or
                              "archive.zip" depending on arguments.
    -g, --glob                Force a single argument to passed into "fast-glob"
                              and create an archive file.
    -h, --help                Display this message.
    -p, --port <number>       Server port number instead of a system assigned one.
    -t, --type <content-type> Content-Type to use, also changes extension of the
                              filename. Overrides -e.
    -v, --verbose             Output debugging information.
    --version                 Display version information.
`
	); /* eslint-enable indent */
}

function version() {
	console.log(`Version ${colors.info(pkg.version)}, written by ${colors.info(parseAuthor(pkg.author).name)}`);
}

function doStdin(options, callback) {
	const cwd = process.cwd();

	let filename = options.filename || 'stdin.txt';

	debug('sending server data read from stdin');

	if (options.extension) {
		filename = path.basename(filename, '.txt') + '.' + options.extension;
	}

	const stat = new Stats({
		mode: S_IFREG | (process.umask() ^ 0o666)
	});
	const contents = new StatStream(stat);
	const file = new Vinyl({
		contents: contents,
		cwd: cwd,
		path: path.join(cwd, filename),
		stat: stat
	});

	contents.once('stats', () => {
		debug('stdin done piping');

		callback(null, file);
	});

	process.stdin.pipe(contents);
}

function doSingleFile(filename, options, callback) {
	const cwd = process.cwd();

	let displayName = options.filename || filename;

	if (options.extension) {
		displayName = path.basename(displayName, path.extname(displayName)) + '.' + options.extension;
	}

	debug('sending server a single file');

	fs.open(filename, 'r', (oErr, fd) => {
		if (oErr) return callback(oErr);

		fs.fstat(fd, (fErr, stat) => {
			if (fErr) return (fs.close(fd), callback(fErr));

			const contents = fs.createReadStream(filename, {
				autoClose: true,
				fd: fd,
				start: 0,
				end: stat.size
			});
			const file = new Vinyl({
				contents: contents,
				cwd: cwd,
				path: path.resolve(cwd, displayName),
				stat: stat
			});

			callback(null, file);
		});
	});
}

function doMultipleFiles(filenames, options, callback) {
	const cwd = process.cwd();

	let filename = options.filename || 'archive.zip';

	debug('sending server an archive of multiple files');

	if (options.extension) {
		console.error(colors.warning('Warning: setting extension on a zip of the passed files'));
		filename = path.basename(filename, '.zip') + '.' + options.extension;
	}

	fastGlob.async(filenames, {
		onlyFiles: false,
		stats: true
	}).then(filestats => {
		const zip = new yazl.ZipFile();
		const stat = new Stats({
			mode: S_IFREG | (process.umask() ^ 0o666)
		});
		const contents = new StatStream(stat);
		const file = new Vinyl({
			contents: contents,
			cwd: cwd,
			path: path.join(cwd, filename),
			stat: stat
		});

		for (const fstat of filestats) {
			const pathname = path.relative(cwd, fstat.path);
			const zipOptions = {
				compress: true,
				forceZip64Format: false,
				mode: fstat.mode,
				mtime: fstat.mtime,
				size: fstat.size
			};

			if (fstat.isFile()) {
				const fstream = fs.createReadStream(fstat.path);

				debug('adding "%s" to archive', pathname);

				stat.uid = Math.min(fstat.uid, stat.uid);
				stat.gid = Math.min(fstat.gid, stat.gid);

				zip.addReadStream(fstream, pathname, zipOptions);
			} else if (fstat.isDirectory()) {
				debug('adding "%s" to archive', pathname);

				zip.addEmptyDirectory(pathname, zipOptions);
			}
		}

		contents.once('stats', () => {
			debug('archive created');

			callback(null, file);
		});

		zip.outputStream.pipe(contents);
		zip.end();
	}).catch(error => {
		callback(error);
	});
}
