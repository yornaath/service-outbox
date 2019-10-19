"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Either_1 = require("fp-ts/lib/Either");
exports.end = "end";
exports.createAdapter = () => {
    const sinks = [];
    return [a => broadcast(sinks, a), new FanoutPortStream(sinks)];
};
const broadcast = (sinks, a) => sinks.slice().forEach(({ sink, scheduler }) => tryEvent(scheduler.currentTime(), a, sink));
class FanoutPortStream {
    constructor(sinks) {
        this.sinks = sinks;
    }
    run(sink, scheduler) {
        const s = { sink, scheduler };
        this.sinks.push(s);
        return new RemovePortDisposable(s, this.sinks);
    }
}
exports.FanoutPortStream = FanoutPortStream;
class RemovePortDisposable {
    constructor(sink, sinks) {
        this.sink = sink;
        this.sinks = sinks;
    }
    dispose() {
        const i = this.sinks.indexOf(this.sink);
        if (i >= 0) {
            this.sinks.splice(i, 1);
        }
    }
}
exports.RemovePortDisposable = RemovePortDisposable;
function tryEvent(t, a, sink) {
    try {
        if (Either_1.isLeft(a))
            sink.error(t, a.left);
        else if (a.right === "end")
            sink.end(t);
        else
            sink.event(t, a.right);
    }
    catch (e) {
        sink.error(t, e);
    }
}
