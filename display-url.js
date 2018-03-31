var debug = require('debug')('quick-transfer:display-url');
var path = require('path');
var qrcode = require('qrcode-terminal');
var url = require('url');

module.exports = display;

function display(host, port, file) {
	var uri = url.format({
		protocol: 'http:',
		hostname: host,
		port: port,
		pathname: '/' + path.basename(file.path)
	});

	debug('formated uri: "%s"', uri);

	return new Promise(resolve => {
		debug('generated qrcode');

		qrcode.generate(uri, resolve);
	});
}
