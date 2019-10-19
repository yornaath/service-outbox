require("dotenv/config")

import bluebird from 'bluebird'
import * as shortid from 'shortid'
import { tap, runEffects, map, take } from "@most/core"
import * as mocha from "mocha"
import mongoose from "mongoose"
import * as assert from "assert"
import { isRight } from "fp-ts/lib/Either"
import { ServiceOutbox } from "../src"

describe("ServiceOutbox", () => {

  const collectionName = shortid.generate()
  
  let connection: typeof mongoose

  type FooMessage = {
    type: "foo"
    data: {
      fooval: string
    }
  }

  type LolMessage = {
    type: "lol"
    data: {
      lolval: string
    }
  }

  type Message = FooMessage | LolMessage

  let outbox: ServiceOutbox<Message>

  before(async () => {
    
    connection = await mongoose.connect(encodeURI(process.env.MONGODB_TEST_URI || ""), {
      useNewUrlParser: true,
      useCreateIndex: true,
      useFindAndModify: false,
      poolSize: 10,
      useUnifiedTopology: true    
    });

    outbox = new ServiceOutbox<Message>(collectionName,{
      "foo": {
        data: {
          fooval: {
            type: String,
            required: true
          }
        }
      },
      "lol": {
        data: {
          lolval: {
            type: String,
            required: true
          }
        }
      }
    })
  })

  after((done) => {
    setTimeout(async() => {
      await mongoose.model(collectionName).collection.drop()
      await connection && connection.disconnect()
      done()
    }, 1500)
  })

  describe("general functionality", () => {

    let cursor = new Date()

    it("open a tail on empty outbox works", (done) => {
      
      const [stream$, scheduler, close] = outbox.tail()

      let a: string[] = []

      const tapped$ = tap((message) => {
        if(message.type === "foo")
          if(message.data.fooval === "end") {
            assert.deepEqual(a, ["1","2","3"])
            setImmediate(async () => {
              cursor = message.created
              await close()
              done()
            })
          } else
            a = [...a, message.data.fooval]
      }, stream$)

      runEffects(tapped$, scheduler)

      mongoose.startSession().then(session => {

        session.startTransaction()

        outbox.put(["1", "2", "3", "end"].map(n => ({
          type: "foo",
          data: {
            fooval: n
          }
        })), session, { autoCommit: true })

      })
      
    }).timeout(10000)

    it("open a tail after a certain date", (done) => {
      
      const [stream$, scheduler, close] = outbox.tail(cursor)

      let a: string[] = []

      const tapped$ = tap((message) => {
        if(message.type === "foo")
          if(message.data.fooval === "end") {
            assert.deepEqual(a, ["1","2","3"])
            setImmediate(async () => {
              await close()
              done()
            })
          } else
            a = [...a, message.data.fooval]
      }, stream$)

      runEffects(tapped$, scheduler)

      mongoose.startSession().then(session => {

        session.startTransaction()

        outbox.put(["1", "2", "3", "end"].map(n => ({
          type: "foo",
          data: {
            fooval: n
          }
        })), session, { autoCommit: true })

      })
      
    }).timeout(10000)

  })
  
})