require("dotenv/config")

import * as mocha from "mocha"
import { delay } from 'bluebird'
import * as shortid from 'shortid'
import { tap, runEffects, merge, zip } from "@most/core"
import mongoose from "mongoose"
import * as assert from "assert"
import _range from "lodash.range"
import { ServiceOutbox } from "../src"
import { newDefaultScheduler } from "@most/scheduler"

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
    }, {max: 1500})
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

    it("should be able to open a tail on empty outbox collection", (done) => {
      
      const [stream$, close] = outbox.tail()
      const scheduler = newDefaultScheduler()

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

    it("should open a tail after a certain date", (done) => {
      
      const [stream$, close] = outbox.tail({
        created: {
          $gt: cursor
        }
      })

      const scheduler = newDefaultScheduler()

      let a: string[] = []

      const tapped$ = tap((message) => {
        if(message.type === "foo")
          if(message.data.fooval === "end") {
            assert.deepEqual(a, ["4","5","6"])
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

        outbox.put(["4", "5", "6", "end"].map(n => ({
          type: "foo",
          data: {
            fooval: n
          }
        })), session, { autoCommit: true })

      })
      
    }).timeout(10000)

    it("should not push messages before transaction is commited", (done) => {
      
      const [stream$, close] = outbox.tail({
        created: {
          $gt: cursor
        }
      })

      const scheduler = newDefaultScheduler()

      let a: string[] = []

      const tapped$ = tap((message) => {
        if(message.type === "lol")
          if(message.data.lolval === "end") {
            assert.deepEqual(a, ["7","8","9"])
            setImmediate(async () => {
              cursor = message.created
              await close()
              done()
            })
          } else
            a = [...a, message.data.lolval]
      }, stream$)

      runEffects(tapped$, scheduler)

      mongoose.startSession().then(async session => {

        session.startTransaction()

        await outbox.put(["7", "8", "9", "end"].map(n => ({
          type: "lol",
          data: {
            lolval: n
          }
        })), session, { autoCommit: false })

        await delay(4000)
        
        assert.equal(a.length, 0)

        await session.commitTransaction()

      })
      
    }).timeout(15000)

    it('should be able to tail concurrently', (done) => {
      
      const [streamA$, closeA] = outbox.tail({
        created: {
          $gt: cursor
        }
      })

      const [streamB$, closeB] = outbox.tail({
        created: {
          $gt: cursor
        }
      })

      const scheduler = newDefaultScheduler()

      const combined$ = zip((a,b) => {
        if(a.created > cursor) cursor = a.created
        if(b.created > cursor) cursor = b.created
        return [
          a.type == "foo" ? a.data.fooval : a.data.lolval,
          b.type == "foo" ? b.data.fooval : b.data.lolval
        ]
      }, streamA$, streamB$)

      let cache: string[] = []

      const tapped$ = tap(async ([a, b]) => {
        cache = [...cache, `${a}${b}`]
        if(a == "end" && b == "end") {
          assert.deepEqual(cache, ["aa", "bb", "cc", "endend"])
          await closeA()
          await closeB()
          await done()
        }
      }, combined$)

      runEffects(tapped$, scheduler)

      mongoose.startSession().then(async session => {

        session.startTransaction()

        await outbox.put(["a", "b", "c", "end"].map(n => ({
          type: "lol",
          data: {
            lolval: n
          }
        })), session, { autoCommit: false })

        await session.commitTransaction()

      })

    }).timeout(15 * 1000)

    // it("should handle large ammount of events", (done) => {
      
    //   const [stream$, scheduler, close] = outbox.tail({
      //   created: {
      //     $gt: cursor
      //   }
      // })

    //   const range = _range(11, 999).map(n => `${n}`)

    //   let buffer: string[] = []

    //   const tapped$ = tap((message) => {
    //     if(message.type === "lol")
    //       if(message.data.lolval === "end") {
    //         assert.deepEqual(buffer, range)
    //         setImmediate(async () => {
    //           cursor = message.created
    //           await close()
    //           done()
    //         })
    //       } else
    //         buffer = [...buffer, message.data.lolval]
    //   }, stream$)

    //   runEffects(tapped$, scheduler)

    //   mongoose.startSession().then(async session => {

    //     for(const n of range) {
    //       session.startTransaction()
    //       await outbox.put({
    //         type: "lol",
    //         data: {
    //           lolval: n
    //         }
    //       }, session)
    //       await session.commitTransaction()
    //     }

    //     session.startTransaction()
    //     await outbox.put({
    //       type: "lol",
    //       data: {
    //         lolval: 'end'
    //       }
    //     }, session)
    //     await session.commitTransaction()

    //   })
      
    // }).timeout(250 * 1000)

  })
  
})