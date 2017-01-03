import {RequestQueue, RequestPriority} from './index';
import * as test from 'tape';

/*
 * These tests use httpbin to easily get certain types of
 * responses and filetypes. See more at https://httpbin.org
 */
const TEST_URL = `https://httpbin.org`

test('arraybuffer responseType', (t) => {
  t.plan(2)
  const requests = new RequestQueue()
  requests.get(`${TEST_URL}/bytes/10`, {
    responseType: 'arraybuffer'
  }).then((response) => {
    t.assert(response instanceof ArrayBuffer)
    t.equal(response.byteLength, 10)
  }).catch(() => {
    t.fail("Request failed")
  })
})

test('blob responseType', (t) => {
  t.plan(2)
  const requests = new RequestQueue()
  requests.get(`${TEST_URL}/bytes/10`, {
    responseType: 'blob'
  }).then((response) => {
    t.assert(response instanceof Blob)
    t.equal(response.size, 10)
  }).catch(() => {
    t.fail("Request failed")
  })
})

test('image responseTypes', (t) => {
  t.plan(3)
  const requests = new RequestQueue();
  ['jpeg', 'png', 'webp'].forEach(function(type) {
    requests.get(`${TEST_URL}/image/${type}`, {
      responseType: 'image'
    }).then((response) => {
      t.assert(response instanceof Image)
      document.body.appendChild(response)
    }).catch(() => {
      t.fail("Request failed")
    })
  })
})

test('Low concurrency', (t) => {
  t.plan(5)
  const requests = new RequestQueue({
    concurrency: 1
  })
  for (var index = 0; index < 5; index++) {
    requests.get(`${TEST_URL}/get?${index}`, {
      priority: RequestPriority.LOW,
      responseType: 'json'
    }).then((response) => {
      t.pass()
    }).catch(() => {
      t.fail("Request failed")
    })
  }
})

test('High concurrency', (t) => {
  t.plan(5)
  const requests = new RequestQueue({
    concurrency: 10
  })
  const promises = []
  for (var index = 0; index < 5; index++) {
    promises.push(requests.get(`${TEST_URL}/get?${index}`, {
      priority: RequestPriority.LOW,
      responseType: 'json'
    }).then((response) => {
      t.pass()
    }).catch(() => {
      t.fail("Request failed")
    }))
  }
})

test('Highest priority postpones lower priority', (t) => {
  t.plan(2)
  const requests = new RequestQueue({
    concurrency: 1
  })

  let doneHigh = false;
  requests.get(TEST_URL, {
    priority: RequestPriority.HIGH
  }).then(() => {
    doneHigh = true;
    t.assert(doneHighest, "Highest priority request not done before lower priority")
  }).catch(() => {
    t.fail("Request failed")
  })

  // Force queue to send here, so that the previous request is in-flight
  // before the HIGHEST one comes in
  requests.update()

  let doneHighest = false;
  requests.get(TEST_URL, {
    priority: RequestPriority.HIGHEST
  }).then(() => {
    doneHighest = true;
    t.assert(!doneHigh, "Lower priority request was done before higher priority")
  }).catch(() => {
    t.fail("Request failed")
  })
})

test('Priority test', (t) => {
  t.plan(12)
  const requests = new RequestQueue({
    retries: 3,
    concurrency: 3
  })

  let doneLow = 0
  let doneHigh = 0
  for (var index = 0; index < 5; index++) {
    requests.get(`${TEST_URL}/get?${index}`, {
      priority: RequestPriority.LOW,
      responseType: 'json'
    }).then((response) => {
      t.equal(doneHigh, 5)
      doneLow++
    }).catch(() => {
      t.fail("Request failed")
    })

    requests.get(`${TEST_URL}/get?high=${index}`, {
      priority: RequestPriority.HIGH,
      responseType: 'json'
    }).then((response) => {
      t.equal(doneLow, 0)
      doneHigh++
    }).catch(() => {
      t.fail("Request failed")
    })
  }

  requests.update()

  requests.get(`${TEST_URL}/get?immediate`, {
    priority: RequestPriority.HIGHEST,
    responseType: 'json'
  }).then((response) => {
    t.equal(doneHigh, 2)
    t.equal(doneLow, 0)
  }).catch(() => {
    t.fail("Request failed")
  })
})
