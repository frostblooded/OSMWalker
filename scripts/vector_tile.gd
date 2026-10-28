## Decodes Mapbox Vector Tiles (protobuf), only as far as the walker needs:
## line and point features of chosen layers, with their tags.
extends RefCounted

const POINT := 1
const LINESTRING := 2


## {layer name: {"extent": int, "features": [{"tags": {}, "lines": [PackedInt32Array]}]}}
## Each line is x0, y0, x1, y1, ... in tile units (0..extent, more in the buffer).
## Point features carry "points" (x0, y0, x1, y1, ...) instead of "lines".
static func decode(buf: PackedByteArray, wanted: Array) -> Dictionary:
	var out := {}
	var r := Reader.new(buf, 0, buf.size())
	while r.more():
		var key := r.varint()
		if key == 0x1A:  # field 3, length-delimited: a layer
			var n := r.varint()
			var layer := _layer(buf, r.pos, r.pos + n, wanted)
			if not layer.is_empty():
				out[layer["name"]] = layer
			r.pos += n
		else:
			r.skip(key & 7)
	return out


static func _layer(buf: PackedByteArray, from: int, to: int, wanted: Array) -> Dictionary:
	var r := Reader.new(buf, from, to)
	var name := ""
	var extent := 4096
	var feature_ranges := []
	var keys := []
	var values := []
	while r.more():
		var key := r.varint()
		match key:
			0x0A:  # 1: name
				name = r.string()
				if not wanted.has(name):
					return {}
			0x12:  # 2: feature
				var n := r.varint()
				feature_ranges.append([r.pos, r.pos + n])
				r.pos += n
			0x1A:  # 3: key
				keys.append(r.string())
			0x22:  # 4: value
				var n := r.varint()
				values.append(_value(Reader.new(buf, r.pos, r.pos + n)))
				r.pos += n
			0x28:  # 5: extent
				extent = r.varint()
			_:
				r.skip(key & 7)
	if not wanted.has(name):
		return {}
	var features := []
	for fr in feature_ranges:
		var f := _feature(Reader.new(buf, fr[0], fr[1]), keys, values)
		if not f.is_empty():
			features.append(f)
	return {"name": name, "extent": extent, "features": features}


static func _value(r: Reader) -> Variant:
	var v: Variant = null
	while r.more():
		var key := r.varint()
		match key:
			0x0A: v = r.string()
			0x15: v = r.buf.decode_float(r.pos); r.pos += 4
			0x19: v = r.buf.decode_double(r.pos); r.pos += 8
			0x20, 0x28: v = r.varint()
			0x30: v = Reader.zigzag(r.varint())
			0x38: v = r.varint() != 0
			_: r.skip(key & 7)
	return v


## Line and point features only; polygons come back empty.
static func _feature(r: Reader, keys: Array, values: Array) -> Dictionary:
	var tags := {}
	var type := 0
	var geom := PackedInt32Array()
	while r.more():
		var key := r.varint()
		match key:
			0x12:  # 2: tags, packed key/value index pairs
				var n := r.varint()
				var end := r.pos + n
				while r.pos < end:
					var k := r.varint()
					var v := r.varint()
					if k < keys.size() and v < values.size():
						tags[keys[k]] = values[v]
			0x18:  # 3: type
				type = r.varint()
			0x22:  # 4: geometry, packed commands
				var n := r.varint()
				var end := r.pos + n
				while r.pos < end:
					geom.append(r.varint())
			_:
				r.skip(key & 7)
	if type == POINT:
		return {"tags": tags, "points": _points(geom)}
	if type != LINESTRING:
		return {}
	return {"tags": tags, "lines": _lines(geom)}


## Turns MoveTo commands into x0, y0, x1, y1, ...
static func _points(geom: PackedInt32Array) -> PackedInt32Array:
	var out := PackedInt32Array()
	var x := 0
	var y := 0
	var i := 0
	while i < geom.size():
		var count := geom[i] >> 3
		i += 1
		for c in count:
			x += Reader.zigzag(geom[i])
			y += Reader.zigzag(geom[i + 1])
			i += 2
			out.append(x)
			out.append(y)
	return out


## Turns MoveTo / LineTo commands into point lists.
static func _lines(geom: PackedInt32Array) -> Array:
	var lines := []
	var line := PackedInt32Array()
	var x := 0
	var y := 0
	var i := 0
	while i < geom.size():
		var cmd := geom[i] & 7
		var count := geom[i] >> 3
		i += 1
		if cmd == 7:  # ClosePath
			continue
		for c in count:
			x += Reader.zigzag(geom[i])
			y += Reader.zigzag(geom[i + 1])
			i += 2
			if cmd == 1:  # MoveTo
				if line.size() >= 4:
					lines.append(line)
				line = PackedInt32Array()
			line.append(x)
			line.append(y)
	if line.size() >= 4:
		lines.append(line)
	return lines


class Reader:
	var buf: PackedByteArray
	var pos: int
	var end: int

	func _init(b: PackedByteArray, from: int, to: int) -> void:
		buf = b
		pos = from
		end = to

	func more() -> bool:
		return pos < end

	func varint() -> int:
		var v := 0
		var shift := 0
		while true:
			var b := buf[pos]
			pos += 1
			v |= (b & 0x7F) << shift
			if b < 0x80:
				return v
			shift += 7
		return v

	func string() -> String:
		var n := varint()
		var s := buf.slice(pos, pos + n).get_string_from_utf8()
		pos += n
		return s

	func skip(wire: int) -> void:
		match wire:
			0: varint()
			1: pos += 8
			2:
				var n := varint()
				pos += n
			5: pos += 4

	static func zigzag(n: int) -> int:
		return (n >> 1) ^ -(n & 1)
