'use strict';

const contentDisposition = require('content-disposition');
const debug = require('debug')('quick-transfer:serve-once');
const http = require('http');
const mime = require('mime-types');
const path = require('path');
const url = require('url');

module.exports = serveOnce;

/**
 * Create a server for the given file. Does not start listening for requests.
 *
 * @param {Vinyl} file
 * @param {function} callback
 * @returns {http.Server}
 */
function serveOnce(file, callback) {
	debug('serving file %O', file);

	const basename = path.basename(file.path);
	const pathname = '/' + basename;
	const server = http.createServer((req, res) => {
		const location = url.parse(req.url);

		let closing = true;

		debug('received request for %s', location.pathname);

		if (location.pathname !== pathname) {
			const body = 'Unknown file: ' + location.pathname;

			debug('responding 404, "%s" did not match expected "%s"', location.pathname, pathname);

			closing = location.pathname !== 'favicon.ico';
			res.writeHead(404, 'Not Found', {
				'Connection': 'close',
				'Content-Length': Buffer.byteLength(body),
				'Content-Type': 'text/plain'
			});
			res.end(body);
		} else {
			const headers = {
				'Connection': 'close',
				'Content-Disposition': contentDisposition(basename),
				'Content-Length': file.stat.size,
				'Content-Type': mime.lookup(file.path) || 'text/plain',
				'Last-Modified': file.stat.mtime.toUTCString()
			};

			debug('responding 200 with headers %O', headers);

			res.writeHead(200, 'OK', headers);
			file.contents.pipe(res);
		}

		res.once('finish', () => {
			if (closing === false) {
				debug('responded 404 to a favicon.ico request');

				return;
			}

			debug('response finished, destroying server next');

			setImmediate(() => {
				kill(server, req.connection);

				server.once('close', () => {
					debug('server closed');

					callback(null);
				});

				debug('destroying all streams');

				file.contents.destroy();
				req.destroy();
				res.destroy();
			});
		});
	});

	return server;
}

function kill(server, socket) {
	debug('killing server and socket');

	server.removeAllListeners();
	socket.removeAllListeners();
	// last resort:
	// 	server.unref();
	// 	socket.unref();
	socket.end();
	socket.destroy();
	server.close();
}
