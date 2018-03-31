var StatStream = require('../stat-stream.js');
var Stats = require('stats-ctor');
var stream = require('stream');
var util = require('util');

var stats = new Stats();
var src = new stream.Readable({
	read: function() {}
});
var stat = new StatStream(stats);
var dest = new stream.PassThrough({
	transform(chunk, enc, next) {
		console.log('chunk: %s', util.inspect(chunk));
		next(null);
	}
});

stat.once('stats', function() {
	console.dir(stats, {colors: process.stdout.isTTY});
	stat.pipe(dest);
});
stat.once('finish', function() {
	console.log('stat finished');
});
dest.once('finish', function() {
	console.log('dest finished');
});
dest.on('error', console.error);

src.pipe(stat);

for (var i = 0; i + 4 <= 40; ) {
	src.push(Buffer.from([
		(i++ * 2) & 0xff,
		(i++ * 3) & 0xff,
		(i++ * 4) & 0xff,
		(i++ * 5) & 0xff
	]));
}

src.push(null);
