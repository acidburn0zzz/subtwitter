"use strict";

const LIM = 500;
const TZ = (new Date()).getTimezoneOffset() * 60 * 1000;

const socket = io.connect("http://localhost:7001");

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

const timestamp = tweet =>
    new Date(parseInt(tweet.timestamp_ms, 10) - TZ).toISOString().replace("T"," ").slice(0,-5);

//FIXME disable rts for self/protected
const buttons = (tweet, stream) =>
    _.map(["retweet", "like", "reply"], action => `
        <img id="${stream}-${action}-${tweet.id_str}"
        onclick="actions('${action}','${tweet.id_str}')"
        src="img/${action}.png">`)
        .join(" ");

const contexts = {
    retweet: tweet =>
        `<img class="context-img" src="img/retweet-on.png"> ${tweet.retweeter}<br/>`,
    reply: tweet =>
        `<img class="context-img" src="img/reply.png"> ${tweet.in_reply_to_screen_name}<br/>`,
    icon: tweet => {
        if(tweet.user.protected)
            return '<img class="context-img" src="img/protected.png">';
        else if(tweet.user.verified)
            return '<img class="context-img" src="img/verified.png">';
        else
            return "";
    }
};

const actions = (action, id_str) => {
    if(action == "reply") {
        console.log("not implemented!");
        return;
    }

    //FIXME this is silly, clean up naming a bit
    const base = action.replace(/^un/, "");
    const inverse = action == base ? "un" + base : base;
    const img = action == base ? base + "-on" : base;

    socket.emit(action, id_str);

    _.each(streams.viewing(), stream => {
        let el = document.getElementById(`${stream}-${base}-${id_str}`);
        if(el) {
            el.src = `img/${img}.png`;
            el.setAttribute("onClick", `actions('${inverse}','${id_str}')`);
        }
    });
};

const buildTweet = (tweet, stream) => {
    //TODO this replaces embedded tweet links fyi
    //replace the link out with a modal
    if(tweet.extras.urls) {
        _.each(tweet.extras.urls, url => {
            let re = new RegExp(url.text, "g");
            tweet.text = tweet.text.replace(re, `(<a href="${url.real}" target="_blank">${url.pretty}</a>)`);
        });
    }

    //TODO add support for multiple
    if(tweet.extras.photos) {
        tweet.text += "<br/>";

        _.each(tweet.extras.photos, (photo, index) => {
            let re = new RegExp(photo.text, "g");
            tweet.text = tweet.text.replace(re, "");
            tweet.text += `<a href="${photo.real}" target="_blank"><img class="stream-img${index > 0 ? "-sm" : ""} " src="${photo.real}"></a>${index == 0 && tweet.extras.photos.length > 1 ? "<br/>" : ""}`;
        });
    }
        
    const el = `
    <div id="${stream}-${tweet.id_str}" class="tweet">
        <div class="tweet-av"><img src="${tweet.user.profile_image_url}"></div>
        <div class="tweet-txt">
            <div class="tweet-head">
                ${tweet.retweeter ? contexts.retweet(tweet) : tweet.in_reply_to_screen_name ? contexts.reply(tweet) : ""}
                <strong>${tweet.user.name}</strong> @${tweet.user.screen_name} ${contexts.icon(tweet)}<br/>
                ${timestamp(tweet)} via ${tweet.source}
            </div>
            ${tweet.text}<br/>
            <div class="tweet-bot"> ${buttons(tweet, stream)}</div>
        </div>
    </div>`;

    let div = document.createElement("div");
    div.innerHTML = el;

    return div;
};

socket.on("join", msg => {
    console.log(msg);
});

socket.on("log", msg => {
    console.log(msg);
});

socket.on("timeline", tweet => {
    console.log(tweet);
    streams.truncate();

    streams.timeline.buffer.push(tweet);
    timeline.insertBefore(buildTweet(tweet, "timeline"), timeline.firstChild);
});

socket.on("feed", tweet => {
    console.log(tweet);
    streams.truncate();

    streams.feed.buffer.push(tweet);
    feed.insertBefore(buildTweet(tweet, "feed"), feed.firstChild);
});

socket.on("mentions", tweet => {
    console.log(tweet);
    streams.truncate();

    streams.mentions.buffer.push(tweet);
    mentions.insertBefore(buildTweet(tweet, "mentions"), mentions.firstChild);
});
