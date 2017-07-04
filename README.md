# requestq
A tiny, intelligent queue for ajax requests in the browser:
* Prioritize requests, even cancelling long-running low-priority requests when high-priority requests come in.
* Throttle requests, executing only a set number at a time
* Retry requests 
* Only 2KB (minified and gzipped)

## Installation
```
npm install requestq --save
```
If you need to support most browsers, you will also need a Promise polyfill if you do not already have one:
```
npm install promise-polyfill --save-exact
```

## Usage
```
import {RequestQueue} from 'requestq';

const requests = new RequestQueue()
requests.get('https://example.com/terms.txt).then((response) => {
  console.log('Got terms: ', response)  
}).catch(() => {
  console.error('Request failed')
})
```

## Advanced Usage
```
import {RequestQueue, RequestPriority} from 'requestq';

const requests = new RequestQueue({
    retries: 3,
    concurrency: 5
})

let terms = requests.get('https://example.com/terms.txt), {
  priority: RequestPriority.LOW
}).then((response) => {
  console.log('Got terms: ' + response)  
}).catch(() => {
  console.error('Request failed after 3 retries')
})

let names = requests.get('https://example.com/names.json', {
    priority: RequestPriority.HIGHEST,
    responseType: 'json'
}).then((response) => {
  // Use the response object
}).catch(() => {
  console.error('Request failed after 3 retries')
})
await Promise.all([terms, names])
```

## Documentation
#### new RequestQueue(options)
Makes a new RequestQueue. Options can be:
* **retries**: number of times a GET request will be retried on errors. (Default: 3)
  * Only GET requests are retried, as retrying POST can create duplicate objects or unwanted effects.
* **concurrency**: number of concurrent requests the queue can have in-flight (Default: 6)

#### RequestQueue.request(method, url, options)
Puts request in the queue. Returns a promise that resolves when
the request is done, or rejects if it fails.
* **method**: the HTTP method for the request, e.g. "GET"
* **url**: The URL for the request
* **options**:
    * priority: Defines the order in which requests get sent. One of the following:
        * RequestQueue.LOW
        * RequestQueue.MEDIUM (default) 
        * RequestQueue.HIGH
        * RequestQueue.HIGHEST 
        
        HIGHEST is special: It actually aborts HIGH, MEDIUM or LOW requests to be tried again,
        if there are too many requests in flight)
    * body: The request body if applicable. Either a string or an object (automatically JSON.stringified)
    * responseType: One of the following:
        * null (default, uses browser behavior)
        * json: Parses the response as JSON and returns an object. Sets Accept: application/json as a request header.
        * text: Returns the response as text
        * blob: Returns a Blob
        * arraybuffer: Returns an ArrayBuffer
        * image: Returns an Image
    * headers: Object of additional headers to set

#### RequestQueue.get(url, options)
#### RequestQueue.post(url, options)
#### RequestQueue.patch(url, options)
#### RequestQueue.delete(url, options)
#### RequestQueue.head(url, options)
#### RequestQueue.options(url, options)
Shorthands for RequestQueue.request("*method*" ...).

## FAQ
Why are you not using the Fetch API?
* The Fetch API does not support aborting a request, which is required for 
high priority requests to abort and requeue lower priority requests.

Why does this not support Node?
* Keeping the library tiny. If you need a universal client, [axios](https://github.com/mzabriskie/axios) is really neat.
