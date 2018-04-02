#!/usr/bin/env node

var chalk = require('chalk');
var createDebug = require('debug');
var debug = createDebug('quick-transfer:cli');
var display = require('./display-url.js');
var fastGlob = require('fast-glob');
var fs = require('fs');
var internalIP = require('internal-ip');
var mime = require('mime-types');
var minimist = require('minimist');
var net = require('net');
var parseAuthor = require('parse-author');
var path = require('path');
var pkg = require('./package.json');
var serveOnce = require('./serve-once.js');
var Stats = require('stats-ctor');
var StatStream = require('./stat-stream.js');
var Vinyl = require('vinyl');
var yazl = require('yazl');
var colors = {
	error: chalk.red,
	warning: chalk.cyan,
	info: chalk.gray
};
var S_IFREG = 0o100000; // fs.constants.S_IFREG which is not available in node v4.x

if (require.main === module) {
	process.title = 'quick-transfer';
	process.exitCode = 0;
	main(process.argv.slice(2), err => {
		if (err) {
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
	var options = minimist(argv, {
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
	var filenames = options._.slice();
	var ready = (err, file) => {
		if (err) return callback(err);

		var server = serveOnce(file, (sErr, info) => {
			callback(sErr);
			debug('server stopped %O', info);
		});

		server.listen(parseInt(options.port, 10) || 0, net.isIPv4(options.address) ? options.address : '0.0.0.0', () => {
			var binding = server.address();
			var address = binding.address;
			var port = binding.port;
			var qrcode = null;

			debug('server listening on %s:%s', address, port);

			if (net.isIPv4(options.display)) {
				qrcode = display(options.display, port, file);
			} else if (address === '0.0.0.0' || address === '127.0.0.1') {
				debug('getting internal IP because address is a loopback device');

				qrcode = internalIP.v4().then(ip => {
					return display(ip, port, file);
				});
			} else {
				qrcode = display(address, port, file);
			}

			qrcode.then(str => {
				console.log(str);
			}); // handling errors here is not the easiest. I need to kill the server if that happens.
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
  $ quick-transfer [files]

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
	console.log(`Version ${pkg.version}, written by ${parseAuthor(pkg.author).name}`);
}

function doStdin(options, callback) {
	var filename = options.filename || 'stdin.txt';
	var cwd = process.cwd();

	debug('sending server data read from stdin');

	if (options.extension) {
		filename = path.basename(filename, '.txt') + '.' + options.extension;
	}

	var stat = new Stats({
		mode: S_IFREG | (process.umask() ^ 0o666)
	});
	var contents = new StatStream(stat);
	var file = new Vinyl({
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
	var cwd = process.cwd();
	var displayName = options.filename || filename;

	if (options.extension) {
		displayName = path.basename(displayName, path.extname(displayName)) + '.' + options.extension;
	}

	debug('sending server a single file');

	fs.open(filename, 'r', (oErr, fd) => {
		if (oErr) return callback(oErr);

		fs.fstat(fd, (fErr, stat) => {
			if (fErr) return (fs.close(fd), callback(fErr));

			var contents = fs.createReadStream(filename, {
				autoClose: true,
				fd: fd,
				start: 0,
				end: stat.size
			});
			var file = new Vinyl({
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
	var filename = options.filename || 'archive.zip';
	var cwd = process.cwd();

	debug('sending server an archive of multiple files');

	if (options.extension) {
		console.error(colors.warning('Warning: setting extension on a zip of the passed files'));
		filename = path.basename(filename, '.zip') + '.' + options.extension;
	}

	fastGlob.async(filenames, {
		onlyFiles: false,
		stats: true
	}).then(filestats => {
		var zip = new yazl.ZipFile();
		var stat = new Stats({
			mode: S_IFREG | (process.umask() ^ 0o666)
		});
		var contents = new StatStream(stat);
		var file = new Vinyl({
			contents: contents,
			cwd: cwd,
			path: path.join(cwd, filename),
			stat: stat
		});

		for (var fstat of filestats) {
			var pathname = path.relative(cwd, fstat.path);
			var zipOptions = {
				compress: true,
				forceZip64Format: false,
				mode: fstat.mode,
				mtime: fstat.mtime,
				size: fstat.size
			};

			if (fstat.isFile()) {
				var fstream = fs.createReadStream(fstat.path);

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
