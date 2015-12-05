subtwitter
===

I've been planning on writing my own twitter interface that does a lot of fancy things for awhile and web twitter has finally annoyed me enough to start. So here we are.

What Works
---

* Timeline
* Mentions
* Favs
* Retweets

What Doesn't
---

* Uh... well,

What's Required
---

This should work pretty much out of the box actually. `npm install`, `mv .env-sample .env`, fill it out, `node server.js`. It doesn't do anything frighteningly interesting yet (for instance: let you tweet) but, soon.

What's the Plan
---

Copy-pasted verbatim from my planned project file, so excuse the breathlessness:

> personal-use twitter client. multiple streams tweetdeck-style with complex (possibly arbitrary, provide a text box?) filters. possibly modular, if not prolly... vanilla timeline to the left, notifications to the right, slide-out modal on the right for dms and one on the left for tweet pages with proper threading ui (expandable, organized as tree) history stack etc. center is The Feed. web twitter and tweetdeck both treat lists as a misfeature but api support is solid. list creation and adding to/removing from lists (default private) dead simple, higher priority than a follow button with an in-place dropdown. abstract away followings entirely in fact and treat it on the ui like just another list. object of slugs as keys, arrays of ids as vals and merge them with lodash. ex: "my followings cat this list drop that list", "intersect of my followings and this list, plus these three lists", "intersect of at least two of these five lists" etc. there's 1.0. from there pull my last n months of favs, maybe add an unfav button and throw the data in a db, combine that who I reply to and how often plus other factors, train neural net, approximate a "stuff you like" feed adjacent to the normal unfiltered one. gather data on my lists' mean tweet velocity and give my feeds a smooth constant scroll. there's 2.0. analyze my reetweets and negative sentiment tweets to build a news feed hopefully competent enough to pull stuff I'd otherwise see late or not at all, 3.0. once the news feed works, scrape the articles and use that data to expand the reach with google news api, 4.0.
