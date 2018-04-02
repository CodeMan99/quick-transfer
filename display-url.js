'use strict';

const debug = require('debug')('quick-transfer:display-url');
const path = require('path');
const qrcode = require('qrcode-terminal');
const url = require('url');

module.exports = display;

function display(host, port, file) {
	const uri = url.format({
		protocol: 'http:',
		hostname: host,
		port: port,
		pathname: '/' + path.basename(file.path)
	});

	debug('formated uri: "%s"', uri);

	return new Promise(resolve => {
		qrcode.generate(uri, str => {
			debug('generated qrcode');

			resolve({
				qrcode: str,
				uri: uri
			});
		});
	});
}
