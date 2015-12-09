//this design the same tweet could be copied in three places
//this... is probably desirable
//lets us work indiv but also ubiquitous forAll-type helpers
//if proves unwieldly just maintain one buffer
//and give each of these an array of pointers
function Stream(name, active, viewing) {
    this.el = viewing ? document.getElementById(name) : null;
    this.buffer = [];
    this.active = active;
    this.viewing = viewing;
}

function Streams() {
    this.timeline = new Stream("timeline", true, true);
    this.feed = new Stream("feed", true, true);
    this.mentions = new Stream("mentions", true, true);
    this.dms = new Stream("dms", true, false);
}

Streams.prototype = {
    viewing: function() {
        return _(this)
            .keys()
            .filter(key => this[key].viewing)
            .value();
    },
    buffers: function() {
        return _.map(this, stream => stream.buffer);
    },
    truncate: function(stream) {
        let buffers = stream ? [this[stream].buffer] : this.buffers();
        _.each(buffers, buffer => buffer.length > LIM && buffer.shift());
    },
    flush: function(stream) {
        let buffers = stream ? [this[stream].buffer] : streams.buffers();
        _.each(buffers, buffer => buffer = []);
    }
};

let streams = new Streams();
