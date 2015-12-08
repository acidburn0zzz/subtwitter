"use strict";

const LIM = 500;
const TZ = (new Date()).getTimezoneOffset() * 60 * 1000;

let socket; 

//FIXME ugh ok ok it's time to split this into files lol
const ajax = (method,target) => {
	return new Promise((Y,N) => {
		let req = new XMLHttpRequest();

		req.open(method, target, true);

		req.onreadystatechange = () => {
			if(req.readyState == 4) { 
				if(req.status >= 200 && req.status < 400) { 
					try {
						let res = JSON.parse(req.response);
						Y(res);
					} catch(err) {
						N(err);
					}
				}
				else {
					N(new Error(`${req.url} failed: ${req.status} ${req.statusText}`));
				}
			}
		};

		req.send();
	});
};

//alright soooo... design
//I want things to flow one way
//press a key, goes to key listener
//each listener does one thing, calls one  function, no state
//eg esc calls close, n calls new tweet, etc
//the new tweet function or the close function or w/e has all logic
//eg, n, new tweet fn set vis on the box, flips a bool
//n again, new tweet fn sees box open, does nothing
//esc, flips same bool back, hides box
//or... hm. locking system? too fancy maybe?
//
//sooo... hm. what states do I need?
// * ground state, nothing displayed
// * compose tweet
// * view tweet. always in thread/tree? with reply box? (note: want replies to thread *by default*)
// * "chat". maybe just dms, maybe integrates with tweets in a way
// * search!! almost forgot
// * lists mgmt
//also I want hjkl for nav, with border color changes. so left/right selecting column, up/down selecting tweet
//say maybe, shit stops scrolling when you're selecting a tweet, esc out and jump back to top
//maybe space to scroll lock. need to think about mechanics of "scrolling", if we buffer or display none or what
// - r to popup reply to selected tweet, stay in the same box and keep going chains your replies
// - n to popup new tweet, ctrl+enter sends, alt+enter sends and leaves window open for chaining?
//or... stick with vi modal paradigm? problem is now esc doesn't always do the same thing
//metakeys here are... eh, acceptable. want to hew to twitter keys much as poss
// - f for like. sorry twitter I need the l key
// - t for retweet
// - m for dm
//hmm perhaps in situations like this I want a diff key for "soft esc"?
//or maybe, say, hovering a tweet, m opens dm to its author, h takes to back to main dm screen?
// - y for list (yank). hovering tweet, opens say a tickbox meu for that user. h to the main lists screen
//ideally number my lists automatically (and keep order constant if I can)
//so like y a user and press number keys to toggle, post on esc if changes? u to undo mb?
//then eventually filter toggles and such, prolly just stick up top and number them
const keyups = evt => {
    if(state.display.compose)
        state.fns.composeCount();

    switch(evt.keyCode) {
        //enter
        case 13:
            if(state.display.compose && (evt.ctrlKey || evt.metaKey) && state.fns.composeCount() <= 140) {
                let textarea = document.getElementById("compose-textarea");

                //socket.emit("tweet", { text: textarea.value });
                console.log(evt.cancelable);
                console.log(`tweeting! ${textarea.value}`);
                textarea.value = "";
                state.fns.composeCount();

                if(evt.ctrlKey) {
                    //TODO yp from 27, make this a function or something lol
                    //state.ground = true;
                    //_.each(state.display, (val, key, obj) => obj[key] = false);
                    //_.each(state.els, (val, key, obj) => obj[key].style.visibility = "hidden");
                }
                //evt.preventDefault();
            }
            break;
        //esc
        case 27:
            //undisplay all modals and drop to main screen
            state.ground = true;
            _.each(state.display, (val, key, obj) => obj[key] = false);
            _.each(state.els, (val, key, obj) => obj[key].style.visibility = "hidden");
            break;
        //n
        case 78:
            //if main screen open new tweet else do nothing
            //FIXME this is ehhhh idk
            state.ground = false;
            state.display.overlays = true;
            state.display.compose = true;
            state.els.overlayBkg.style.visibility = "visible";
            state.els.overlayContainer.style.visibility = "visible";
            state.els.compose.style.visibility = "visible";

            let textarea = document.getElementById("compose-textarea");
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);

            state.fns.composeCount();
            break;
    }
};

//perhaps provide functions? constructor? idk
let state = {
    //bools set by things
    ground: true,
    display: {
        overlays: false,
        compose: false
    },
    //vis-toggleable elements
    els: {
        overlayBkg: document.getElementById("overlay-bkg"),
        overlayContainer: document.getElementById("overlay-container"),
        compose: document.getElementById("compose")
    },
    //namespace for random functions
    fns: {
        composeCount: () => {
            let txt = document.getElementById("compose-textarea").value;
            let cc = document.getElementById("compose-char-count");
            cc.innerText = 140 - txt.length;

            return cc.innerText;
        }
    }
    //TODO select position, scroll lock, etc etc
};

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
        `<img class="context-img" src="img/reply.png"> ${tweet.in_reply_to_name}<br/>`,
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

ajax("GET", "/io/port").then(res => {
    socket = io.connect(`http://localhost:${res.port}`);

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
});

window.addEventListener("keyup", keyups, false);
