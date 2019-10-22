
import { Stream } from '@most/types'
import { right, left } from 'fp-ts/lib/Either'
import { delay } from 'bluebird'
import { Schema, SchemaDefinition, Model, Document, model, QueryCursor, ClientSession } from 'mongoose'
import { createAdapter } from './lib/streamadapter'
import { isArray } from 'util'

export type TOutboxAbstractMessageType = {
  type: string
  data: object
}

export type TWithCreatedDate = {
  created: Date
}

export type TOutboxMessage <T extends TOutboxAbstractMessageType> = T & TWithCreatedDate

export type TOutboxMessageScehma = {
  [type: string]: SchemaDefinition
}

export type TServiceOutboxConfiguration = {
  size?: number
  max?: number
  awaitInterval?: number
}

export type TOutboxTail<T extends TOutboxAbstractMessageType, TM extends TOutboxMessage<T> = T & TWithCreatedDate> = {
  open(): void
  close(): void
  stream$: Stream<TM>
}

export class ServiceOutbox<T extends TOutboxAbstractMessageType, TM extends TOutboxMessage<T> = T & TWithCreatedDate> {

  private messageModel: Model<TM & Document>

  private models: {
    [key: string]: Model<TM & Document>
  }

  private config?: TServiceOutboxConfiguration

  constructor(collectionName: string, schema: TOutboxMessageScehma, config?: TServiceOutboxConfiguration) {

    this.config = config

    const options = { 
      discriminatorKey: 'type',
      capped: {
        size: config && config.size ? config.size : (1024 * 2),
        max: config && config.max ? config.max : 1000
      }
    }

    const messageSchema = new Schema({
      type: {
        type: String,
        required: true
      },
      created: {
        type: Date,
        default: Date.now,
        index: true
      }
    }, options)
    
    this.messageModel = model(collectionName, messageSchema)

    this.models = Object.keys(schema).reduce((models, type) => {
      return {
        ...models,
        [type]: this.messageModel.discriminator(type, new Schema(schema[type], options))
      }
    }, {})
  }

  async put(message: T | T[], session: ClientSession, opts?: { autoCommit: boolean }) {

    let out: (TM & Document)[] = []

    if(isArray(message)) {
      for (const messageItem of message)
        out = [...out, ...await this.models[messageItem.type].create([messageItem], { session })]
    }
    else {
      out = await this.models[message.type].create([message], { session })
    }

    if(opts && opts.autoCommit)
      await session.commitTransaction()

    return out
  }

  tail(query?: any): TOutboxTail<T, TM> {
    const [ pushEvent, stream$ ] = createAdapter<TM>()

    const awaitInterval = this.config && this.config.awaitInterval ? this.config.awaitInterval : 200;

    let cursor: QueryCursor<any>

    const open = async (): Promise<void> => {
      const count = await this.messageModel.countDocuments()

      if(count === 0) {
        await delay(awaitInterval)
        return open()
      }

      cursor = this.messageModel
        .find(query || undefined)
        .tailable()
        .cursor()
          .on('data', document => pushEvent(right(document)))
          .on('error', error => {
            if(error.message.toLowerCase().match('no more documents in tailed cursor'))
              setTimeout(open, awaitInterval)
            else
              pushEvent(left(error))
          })
          .on('close', () => pushEvent(right("end")))
    }

    const close = async () => {
      if(cursor)
        await cursor.close()
      pushEvent(right("end"))
    }

    return {
      open,
      close,
      stream$
    }
  }

}