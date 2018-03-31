var debug = require('debug')('quick-transfer:stat-stream');
var Transform = require('stream').Transform;

module.exports = StatStream;

/**
 * Stream that populates the given stat's size, blksize, & blocks.
 *
 * @example basic usage
 * var stat = new fs.Stats();
 * var contents = new StatStream(stat);
 * src.pipe(contents).on('finish', () => {
 * 	// treat `contents` like a Readable source here
 * });
 */
function StatStream(stats) {
	Transform.call(this);

	this._stats = stats;
	this.blocks = 8;
	stats.blksize = stats.blksize || 4096;

	debug('creating instance for %O', stats);
}

StatStream.super_ = Transform;
StatStream.prototype = Object.create(Transform.prototype, {
	constructor: {
		configurable: true,
		enumerable: false,
		value: StatStream,
		writable: true
	}
});

StatStream.prototype._transform = function(chunk, enc, next) {
	var stat = this._stats;

	stat.size += chunk.byteLength;
	stat.blocks = Math.ceil(stat.size / stat.blksize) * this.blocks;

	debug('process %d bytes, new size %d', chunk.byteLength, stat.size);

	next(null, chunk);
};

StatStream.prototype._flush = function(callback) {
	debug('emitting "stats" event');

	this.emit('stats', this._stats);
	this.push(null);

	callback();
};
