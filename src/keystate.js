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
//
//UPDATE changing from keyup to keydown to catch enter... gah need tests soon
//ohhhh ok unlike CERTAIN GAME ENGINES keydown fires many if held, this is a pleasant surprise
const keydowns = evt => {
    if(state.display.compose)
        state.fns.composeCount();

    switch(evt.keyCode) {
        //enter
        case 13:
            //TODO meta will display the tweet above box and thread 
            //implement after I do tweet display
            if(state.display.compose && (evt.ctrlKey /*|| evt.metaKey*/) && state.fns.composeCount() <= 140) {
                let textarea = document.getElementById("compose-textarea");

                socket.emit("tweet", { status: textarea.value });
                //console.log(`tweeting! ${textarea.value}`);
                textarea.value = "";
                state.fns.composeCount();

                if(evt.ctrlKey) {
                    //TODO yp from case 27, make this a function or something lol
                    state.ground = true;
                    _.each(state.display, (val, key, obj) => obj[key] = false);
                    _.each(state.els, (val, key, obj) => obj[key].style.visibility = "hidden");
                }

                evt.preventDefault();
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
            if(state.ground) {
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

                evt.preventDefault();
            }
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

window.addEventListener("keydown", keydowns, false);
