import { RequestQueue, RequestPriority } from './index';
import * as test from 'tape';

/*
 * These tests use httpbin to easily get certain types of
 * responses and filetypes. See more at https://httpbin.org
 */
const TEST_URL = `https://httpbin.org`

test('failure retries, then rejects promise', (t : any) => {
  t.plan(2)
  const requests = new RequestQueue({
    retries: 3
  })

  requests.get(`${TEST_URL}/status/500`)
    .then((response) => {
      t.fail('Promise resolved, but should reject')
    }).catch(() => {
      t.equal(request.sendAttempts, 3)
      t.pass('Promise should reject on a 500')
    })
  // Sneak the request out of the queue, so we can inspect it
  // in our promise callback above
  let request = requests.queue[0]
})

test('authorization header', (t : any) => {
  t.plan(1)
  const requests = new RequestQueue()
  requests.get(`${TEST_URL}/headers`, {
    auth: 'Test auth',
    responseType: 'json'
  }).then((response) => {
    t.equal(response.headers.Authorization, 'Test auth')
  }).catch(() => {
    t.fail('Request failed')
  })
})

test('arraybuffer responseType', (t : any) => {
  t.plan(2)
  const requests = new RequestQueue()
  requests.get(`${TEST_URL}/bytes/10`, {
    responseType: 'arraybuffer'
  }).then((response) => {
    t.assert(response instanceof ArrayBuffer)
    t.equal(response.byteLength, 10)
  }).catch(() => {
    t.fail('Request failed')
  })
})

test('blob responseType', (t : any) => {
  t.plan(2)
  const requests = new RequestQueue()
  requests.get(`${TEST_URL}/bytes/10`, {
    responseType: 'blob'
  }).then((response) => {
    t.assert(response instanceof Blob)
    t.equal(response.size, 10)
  }).catch(() => {
    t.fail('Request failed')
  })
})

test('image responseTypes', (t : any) => {
  t.plan(3)
  const requests = new RequestQueue();
  ['jpeg', 'png', 'webp'].forEach(function (type) {
    requests.get(`${TEST_URL}/image/${type}`, {
      responseType: 'image'
    }).then((response) => {
      t.assert(response instanceof Image)
      document.body.appendChild(response)
    }).catch(() => {
      t.fail('Request failed')
    })
  })
})

test('Low concurrency', (t : any) => {
  t.plan(5)
  const requests = new RequestQueue({
    concurrency: 1
  })
  for (let index = 0; index < 5; index++) {
    requests.get(`${TEST_URL}/get?${index}`, {
      priority: RequestPriority.LOW,
      responseType: 'json'
    }).then((response) => {
      t.pass()
    }).catch(() => {
      t.fail('Request failed')
    })
  }
})

test('High concurrency', (t : any) => {
  t.plan(5)
  const requests = new RequestQueue({
    concurrency: 10
  })
  const promises = []
  for (let index = 0; index < 5; index++) {
    promises.push(requests.get(`${TEST_URL}/get?${index}`, {
      priority: RequestPriority.LOW,
      responseType: 'json'
    }).then((response) => {
      t.pass()
    }).catch(() => {
      t.fail('Request failed')
    }))
  }
})

test('Highest priority postpones lower priority', (t : any) => {
  t.plan(2)
  const requests = new RequestQueue({
    concurrency: 1
  })

  let doneHigh = false;
  let doneHighest = false;
  requests.get(TEST_URL, {
    priority: RequestPriority.HIGH
  }).then(() => {
    doneHigh = true;
    t.assert(doneHighest, 'Highest priority request not done before lower priority')
  }).catch(() => {
    t.fail('Request failed')
  })

  // Wait a bit so that the first request is actually sent
  window.setTimeout(() => {
    requests.get(TEST_URL, {
      priority: RequestPriority.HIGHEST
    }).then(() => {
      doneHighest = true;
      t.assert(!doneHigh, 'Lower priority request was done before higher priority')
    }).catch(() => {
      t.fail('Request failed')
    })
  }, 10)
})

test('Priority test', (t : any) => {
  t.plan(12)
  const requests = new RequestQueue({
    retries: 3,
    concurrency: 3
  })

  let doneLow = 0
  let doneHigh = 0
  for (let index = 0; index < 5; index++) {
    requests.get(`${TEST_URL}/get?${index}`, {
      priority: RequestPriority.LOW,
      responseType: 'json'
    }).then((response) => {
      t.equal(doneHigh, 5)
      doneLow++
    }).catch(() => {
      t.fail('Request failed')
    })

    requests.get(`${TEST_URL}/get?high=${index}`, {
      priority: RequestPriority.HIGH,
      responseType: 'json'
    }).then((response) => {
      t.equal(doneLow, 0)
      doneHigh++
    }).catch(() => {
      t.fail('Request failed')
    })
  }

  // Wait a bit so that the first requests are actually sent
  window.setTimeout(() => {
    requests.get(`${TEST_URL}/get?immediate`, {
      priority: RequestPriority.HIGHEST,
      responseType: 'json'
    }).then((response) => {
      t.equal(doneHigh, 2)
      t.equal(doneLow, 0)
    }).catch(() => {
      t.fail('Request failed')
    })
  }, 10)
})

test('Blocked/Invalid client request', (t: any) => {
  t.plan(1)
  t.timeoutAfter(10000)
  const requests = new RequestQueue({
    retries: 0,
    concurrency: 3
  })
  requests.get(`https://Invalid-Url`)
  .then((response) => {
    t.fail('Client-side errors should fail properly')
  }).catch(() => {
    t.pass()
  })
})

test('post', (t: any) => {
  t.plan(1)
  const requests = new RequestQueue()
  requests.post(`${TEST_URL}/post`, {
    responseType: 'json',
    body: {test: 'value'}
  }).then((response) => {
    const res = JSON.parse(response.data)
    t.equal(res.test, 'value')
  }).catch((err) => {
    t.fail('Request failed' + err)
  })
})

test('post form with file', (t: any) => {
  t.plan(2)
  const requests = new RequestQueue()
  requests.get(`${TEST_URL}/image/jpeg`, {responseType: 'arraybuffer'}).then((img) => {
    const form = new FormData();  
    var blob = new Blob( [ new Uint8Array( img ) ], { type: "image/jpeg" } );  
    form.append('src', blob, 'image.jpg');
    form.append('name', 'image.jpg');
    requests.post(`${TEST_URL}/post`, {
      responseType: 'json',
      body: form,
    }).then((response) => {
      t.equal(response.form.name, 'image.jpg')
      t.equal('src' in response.files, true)
    }).catch((err) => {
      t.fail('Request failed' + err)
    })
  })
})

test('patch', (t: any) => {
  t.plan(1)
  const requests = new RequestQueue()
  requests.patch(`${TEST_URL}/patch`, {
    responseType: 'json',
    body: {test: 'value'}
  }).then((response) => {
    const res = JSON.parse(response.data)
    t.equal(res.test, 'value')
  }).catch((err) => {
    t.fail('Request failed' + err)
  })
})

test('delete', (t: any) => {
  t.plan(1)
  const requests = new RequestQueue()
  requests.delete(`${TEST_URL}/delete`, {
    responseType: 'json',
  }).then((response) => {
    t.pass()
  }).catch((err) => {
    t.fail('Request failed' + err)
  })
})
