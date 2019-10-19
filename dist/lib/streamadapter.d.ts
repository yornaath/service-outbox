import { Disposable, Scheduler, Sink, Stream } from '@most/types';
import { Either } from 'fp-ts/lib/Either';
export declare const end: "end";
export declare type TEvent<A> = Either<Error, A | "end">;
export declare type Adapter<A, B> = [(event: TEvent<A>) => void, Stream<B>];
export declare const createAdapter: <A>() => [(event: Either<Error, "end" | A>) => void, Stream<A>];
export declare class FanoutPortStream<A> {
    private readonly sinks;
    constructor(sinks: {
        sink: Sink<A>;
        scheduler: Scheduler;
    }[]);
    run(sink: Sink<A>, scheduler: Scheduler): Disposable;
}
export declare class RemovePortDisposable<A> implements Disposable {
    private readonly sink;
    private readonly sinks;
    constructor(sink: {
        sink: Sink<A>;
        scheduler: Scheduler;
    }, sinks: {
        sink: Sink<A>;
        scheduler: Scheduler;
    }[]);
    dispose(): void;
}
