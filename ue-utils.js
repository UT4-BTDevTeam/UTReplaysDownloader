
//============================================================

class UReader {
	constructor(buffer) {
		this.buffer = buffer;
		this.offset = 0;
	}

	int32() {
		this.offset += 4;
		return this.buffer.readInt32LE(this.offset-4);
	}

	uint32() {
		this.offset += 4;
		return this.buffer.readUInt32LE(this.offset-4);
	}

	fstring() {
		let size = this.int32();
		if ( size >= 0 ) {
			this.offset += size;
			return this.buffer.toString('utf8', this.offset-size, this.offset-1);
		}
		else {
			size *= -2;
			this.offset += size;
			return this.buffer.toString('utf16le', this.offset-size, this.offset-2);
		}
	}

	fname() {
		return this.fstring();
	}

	tmap(keyType, valueType) {
		let size = this.uint32();
		let map = {};
		for ( var i=0; i<size; i++ ) {
			let key = this[keyType]();
			let value = this[valueType]();
			map[key] = value;
		}
		return map;
	}

	tarray(innerType) {
		let size = this.uint32();
		let arr = [];
		for ( var i=0; i<size; i++ )
			arr.push( this[innerType]() );
		return arr;
	}
}

UReader.fromFile = function(filePath) {
	return new UReader(require('fs').readFileSync(filePath));
}

//============================================================

const WRITE_BUF_SIZE = 100000;

class UWriter {
	constructor(filePath) {
		this.filePath = filePath;

		if ( this.filePath )
			require('fs').writeFileSync(filePath, "");

		//this.buffers = [];
		this.buffer = Buffer.alloc(WRITE_BUF_SIZE);
		this.offset = 0;
	}

	checkBuf(forSize) {
		if ( this.offset+forSize >= this.buffer.length ) {
			/*
			this.buffers.push( this.buffer.slice(0, this.offset) ) ;
			this.buffer = Buffer.alloc(WRITE_BUF_SIZE);
			this.offset = 0;
			*/
			var newBuffer = Buffer.alloc(this.buffer.length + WRITE_BUF_SIZE);
			this.buffer.copy(newBuffer, 0, 0, this.buffer.length);
			this.buffer = newBuffer;
		}
	}

	int32(val) {
		this.checkBuf(4);
		this.offset = this.buffer.writeInt32LE(val, this.offset);
	}

	uint32(val) {
		this.checkBuf(4);
		this.offset = this.buffer.writeUInt32LE(val, this.offset);
	}

	fstring(val) {
		if ( val.length > 0 ) {
			this.int32(val.length+1);
			this.checkBuf(val.length+1);
			this.offset += this.buffer.write(val, this.offset, val.length, 'ascii') + 1;
		}
		else {
			this.int32(0);
		}
	}

	fname(val) {
		this.fstring(val);
	}

	tmap(map, keyType, valueType) {
		this.int32(Object.keys(map).length);
		for ( var k in map ) {
			this[keyType](k);
			this[valueType](map[k]);
		}
	}

	tarray(arr, innerType) {
		this.int32(arr.length);
		for ( var val of arr )
			this[innerType](val);
	}

	getBuffer() {
		return this.buffer.slice(0, this.offset);
	}

	flush() {
		require('fs').writeFileSync(this.filePath, this.getBuffer(), { flag:'a' });
		this.buffer = Buffer.alloc(WRITE_BUF_SIZE);
		this.offset = 0;
	}
}

//============================================================

module.exports = {
	UReader,
	UWriter,
};
