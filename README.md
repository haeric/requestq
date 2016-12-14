# Request-queue
An intelligent queue for ajax requests in the browser:
* Prioritize requests, even cancelling long-running low-priority requests when high-priority requests come in.
* Throttle requests, executing only a set number at a time
* Retry requests 

## Installation
```
npm install request-queue --save
```
If you need to support most browsers, you will also need a Promise polyfill if you do not already have one:
```
npm install promise-polyfill --save-exact
```

## Usage
```
const queue = new RequestQueue({
    retries: 3,
    concurrency: 5 
})
var terms = queue.get('https://example.com/terms.txt), {
    priority: RequestQueue.LOW
})
var names = queue.get('https://example.com/names.json', {
    priority: RequestQueue.HIGHEST,
})
await Promise.all([names, terms])
```
## Documentation
### new RequestQueue(options)
Makes a new RequestQueue. Options can be:
* retries: number of times a GET request will be retried on errors. (Default: 3)
* concurrency: number of concurrent requests the queue can have in-flight (Default: 6)

### RequestQueue.request(method, url, options)
Puts request in the queue. Returns a promise that resolves when
the request is done, or rejects if it fails
* method: the HTTP method for the request, e.g. "GET"
* url: The URL for the request
* Options:
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
    * headers: Object of additional headers to set

### RequestQueue.get(url, options)
Shorthand for RequestQueue.request("GET" ...). Similar shorthands exist for POST, PUT, PATCH, DELETE, HEAD and OPTIONS.