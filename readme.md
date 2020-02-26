
# service-outbox

A module that uses mongodb and creates a tailable capped collection for publishing events for a microservice.

It can be tailed and has schema validation.

It also ha support for using a session with a transaction to ensure atomicity in modifying state and publishing an event.

### Inspired by

Talks and papers by Chris Richardson

[Using sagas to maintain data consistency in a microservice architecture by Chris Richardson](https://www.youtube.com/watch?v=YPbGW3Fnmbc)

[Pattern: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)

## Real world example

```typescript
import { ServiceOutbox } from "@piing/service-outbox"
import Order from "./models/Order"


// Defining the types of messages this service can publish.

type OrderCreatedMessage = {
  type: "order_created"
  data: {
    ordernr: number
  }
}

type OrderCompletedMessage = {
  type: "order_completed"
  data: {
    ordernr: number
  }
}

type Message = OrderCreatedMessage | OrderCompletedMessage

// Defining the outbox has strong typing and mongoose schema validation.
// Key is the type of message and the object associated is a mongoose.Schema
// Challenge is keeping the types and Schema in sync

const outbox = new ServiceOutbox<Message>("OrderServiceOutbox",{
  "order_created": {
    data: {
      ordernr: {
        type: Number,
        required: true
      }
    }
  },
  "order_completed": {
    data: {
      ordernr: {
        type: Number,
        required: true
      }
    }
  }
})

// Atomic operation.
// Creating order and creating the outbox message is done in the same transaction.

const makeOrder = async() => {
  const session = await mongoose.startSession()

  session.startTransaction()

  const order = await Order.create(..., { session })

  await outbox.put({
    type: "order_created",
    data: {
      ordernr: order.nr
    }
  }), session)

  await session.commitTransaction()

  return order
}

// Tailing the outbox uses @most/core Streams
// In this example we push the message to kafka.
// We also make sure we that we only publish new events on service restart
// by tracking the cursor of latest published event

const worker = async() => {

  const cursor: Date = await getLatestPublishedServiceCreatedDate()

  const [outbox$, scheduler, close] = outbox.tail(cursor)

  const published$ = tap(async (orderServiceMessage) => {
    await publishToKafka("orders", orderServiceMessage.type, orderServiceMessage.data)
      // Note: if the server where to crash here, its a chance the message can be sent twice.
      // But that is a better option than loosing a message
    await setLatestPublishedServiceCreatedDate(orderServiceMessage.created)
  }, outbox$,)

  runEffects(published$, scheduler)

}

```
