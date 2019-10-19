import { Disposable, Scheduler, Sink, Stream, Time } from '@most/types'
import { Either, isLeft } from 'fp-ts/lib/Either'

export const end: "end" = "end"

export type TEvent<A> = Either<Error, A | "end">

export type Adapter<A, B> = [(event: TEvent<A>) => void, Stream<B>]

export const createAdapter = <A> (): Adapter<A, A> => {
  const sinks: { sink: Sink<A>, scheduler: Scheduler }[] = []
  return [a => broadcast(sinks, a), new FanoutPortStream(sinks)]
}

const broadcast = <A> (sinks: { sink: Sink<A>, scheduler: Scheduler }[], a: TEvent<A>): void =>
  sinks.slice().forEach(({ sink, scheduler }) => tryEvent(scheduler.currentTime(), a, sink))

export class FanoutPortStream<A> {
  constructor (private readonly sinks: { sink: Sink<A>, scheduler: Scheduler }[]) {}

  run (sink: Sink<A>, scheduler: Scheduler): Disposable {
    const s = { sink, scheduler }
    this.sinks.push(s)
    return new RemovePortDisposable(s, this.sinks)
  }
}

export class RemovePortDisposable<A> implements Disposable {
  constructor (private readonly sink: { sink: Sink<A>, scheduler: Scheduler }, private readonly sinks: { sink: Sink<A>, scheduler: Scheduler }[]) {}

  dispose () {
    const i = this.sinks.indexOf(this.sink)
    if(i >= 0) {
      this.sinks.splice(i, 1)
    }
  }
}

function tryEvent <A> (t: Time, a: TEvent<A>, sink: Sink<A>) {
  try {
    if(isLeft(a))
      sink.error(t, a.left)
    else if(a.right === "end")
      sink.end(t)
    else
      sink.event(t, a.right)
  } catch(e) {
    sink.error(t, e)
  }
  
}