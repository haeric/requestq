declare var XDomainRequest: any

export enum RequestPriority {
  LOW, MEDIUM, HIGH, HIGHEST
}

export enum RequestStatus {
  PENDING, SENDING, FAILED, DONE
}

export interface Options {
  priority?: RequestPriority;
  responseType?: string;
  body?: string;
  maxRetries?: number;
  auth?: string;
  withCredentials?: boolean;
  headers?: { [key: string]: any };
  onProgress?: (evt: ProgressEvent) => void;
}

/**
 * Utility: Cross-browser XHR request,
 * Only here to support IE <= 7...
 *
 * @param {string} method
 * @param {string} url
 * @param {boolean} withCredentials
 * @returns
 */
function openXHR(method: string, url: string, withCredentials: boolean): XMLHttpRequest {
  let xhr
  if (typeof XMLHttpRequest !== 'undefined') {
    xhr = new XMLHttpRequest()
    xhr.withCredentials = withCredentials
  }
  else if (typeof XDomainRequest !== 'undefined') {
    xhr = new XDomainRequest()
  }
  else {
    throw new Error('No XMLHTTPRequest or XDomainRequest... are you trying to run me in node? :(')
  }
  xhr.open(method, url, true)
  return xhr
}

export class RequestQueue {
  retries: number
  concurrency: number

  queue: Array<Request> = []
  private updateTimeout: number | null

  constructor({ retries = 3, concurrency = 6 } = {}) {
    this.retries = retries
    this.concurrency = concurrency
  }

  get(url: string, options?: any): Promise<any> {
    return this.request('GET', url, options)
  }

  head(url: string, options?: any): Promise<any> {
    return this.request('HEAD', url, options)
  }

  options(url: string, options?: any): Promise<any> {
    return this.request('OPTIONS', url, options)
  }

  post(url: string, options?: any): Promise<any> {
    return this.request('POST', url, options)
  }

  put(url: string, options?: any): Promise<any> {
    return this.request('PUT', url, options)
  }

  patch(url: string, options?: any): Promise<any> {
    return this.request('PATCH', url, options)
  }

  delete(url: string, options?: any): Promise<any> {
    return this.request('DELETE', url, options)
  }

  request(method: string, url: string, options?: any): Promise<any> {
    const req = new Request(method, url, options)
    this.enqueue(req)
    return req.promise
  }

  /**
   * Handle all queue changes, sending new requests etc
   *
   */
  update() {
    let req
    while (req = this.getNextPendingRequest()) {
      this.sendRequest(req)
    }
    // Cancel any GETs that put us over our concurrency
    // We only cancel GETs, as we can't know that a POST, PATCH etc has not already reached the server
    // This happens when HIGHEST priority requests bump other requests
    while (req = this.getNextOverflowingGet()) {
      req.abort()
      req.status = RequestStatus.PENDING
    }
    this.updateTimeout = null
  }

  /**
   * Enqueue a request, adding it to the right place
   * in the queue based on the priority:
   * Highest prioriy first, oldest requests first
   * @private
   * @param {Request} request
   */
  private enqueue(request: Request) {
    let index = 0;
    for (index = 0; index < this.queue.length; index++) {
      const element = this.queue[index]
      if (element.priority < request.priority) {
        break
      }
    }
    this.queue.splice(index, 0, request)
    // Update queue as soon as possible after this,
    // sending the request. Waiting this way allows for queueing of requests with
    // different priorities to be sent in the right order
    if (!this.updateTimeout) {
      this.updateTimeout = window.setTimeout(() => {
        this.update()
      }, 1)
    }
  }

  /**
   * Remove an item from the queue.
   * Usually because the request is done, or it failed.
   * @private
   * @param {Request} req
   */
  private dequeue(req: Request) {
    const index = this.queue.indexOf(req)
    if (index === -1) {
      throw new Error("Can't dequeue request not in queue")
    }
    this.queue.splice(index, 1)
    // Send new requests since this one is gone
    this.update()
  }

  /**
   * Get the next request that is ready to send
   *
   * @private
   * @returns {(Request | null)}
   */
  private getNextPendingRequest(): Request | null {
    for (let index = 0; index < this.queue.length && index < this.concurrency; index++) {
      const element = this.queue[index]
      if (element.status === RequestStatus.PENDING) {
        return element
      }
    }
    return null
  }

  /**
   * Get the next get request that is currently in flight
   * but pushes us over our concurrency limit
   *
   * @private
   * @returns {(Request | null)}
   */
  private getNextOverflowingGet(): Request | null {
    for (let index = this.concurrency; index < this.queue.length; index++) {
      const element = this.queue[index]
      if (element.status === RequestStatus.SENDING &&
          element.priority !== RequestPriority.HIGHEST &&
          element.method === "GET") {
        return element
      }
    }
    return null
  }

  /**
   * Handle the actual sending of a request, statuses,
   * retries, error and success callbacks
   *
   * @private
   */
  private sendRequest(req: Request) {
    req.status = RequestStatus.SENDING
    req.send().then((response: any) => {
      req.status = RequestStatus.DONE
      this.dequeue(req)
      req.onDone(response)
    }).catch((e: any) => {
      const retryCount = req.maxRetries !== null ? req.maxRetries : this.retries
      if (req.sendAttempts < retryCount) {
        req.status = RequestStatus.PENDING
        // Re-send request
        this.update()
        console.warn(`Retried ${req.url}`)
        console.warn(e)
      }
      else {
        req.status = RequestStatus.FAILED
        this.dequeue(req)
        console.warn(`Failed ${req.url}`)
        req.onFail(e)
      }
    })
  }
}

export class Request {
  url: string
  method: string
  priority: number
  maxRetries: number | null
  responseType: string | null
  auth: string | null
  withCredentials: boolean
  body: string | FormData | null
  headers: { [key: string]: any }

  sendAttempts = 0
  status = RequestStatus.PENDING

  promise: Promise<any>
  onDone: Function
  onFail: Function
  onProgress?: (evt: ProgressEvent) => void;

  private xhr: XMLHttpRequest | null

  /**
   * Creates an instance of Request.
   *
   * @param {string} method
   * @param {string} url
   * @param {any} options: {
   *       priority = RequestPriority.MEDIUM,
   *       responseType = null,
   *       body = null,
   *       auth = null,
   *       maxRetries = null,
   *       headers = {}
   *     }
   */
  constructor(method: string, url: string, options: Options = {}) {
    this.url = url
    this.method = method
    this.auth = options.auth || null
    this.withCredentials = options.withCredentials || false
    this.priority = options.priority || RequestPriority.MEDIUM
    this.responseType = options.responseType || null
    this.body = options.body || null
    this.headers = options.headers || {}
    this.maxRetries = options.maxRetries || null
    this.onProgress = options.onProgress;
    this.promise = new Promise((resolve, reject) => {
      this.onDone = resolve
      this.onFail = reject
    })
  }

  /**
   * Make and send this XHR
   *
   * @returns {Promise<any>}
   */
  send(): Promise<any> {
    const xhr = this.xhr = openXHR(this.method, this.url, this.withCredentials)

    if (this.responseType) {
      if (this.responseType === 'arraybuffer' ||
        this.responseType === 'text' ||
        this.responseType === 'json' ||
        this.responseType === 'blob') {
        xhr.responseType = this.responseType
      }
      else if (this.responseType === 'image') {
        xhr.responseType = 'blob'
      }
      else {
        throw new Error('reponseType can only be one of "arraybuffer", "text", "json", "blob", "image"')
      }
    }

    if (this.responseType === 'json') {
      xhr.setRequestHeader('Accept', 'application/json')
    }

    if(this.auth && typeof this.auth === 'string') {
      xhr.setRequestHeader('Authorization', this.auth);
    }

    for (const key in this.headers) {
      xhr.setRequestHeader(key, this.headers[key])
    }

    if (this.body && typeof this.body === 'object') {
      if (!(this.body instanceof FormData)) {
        this.body = JSON.stringify(this.body)
        xhr.setRequestHeader('Content-Type', 'application/json')
      }
    }

    if (this.onProgress) {
      xhr.onprogress = this.onProgress;
    }

    return new Promise((resolve, reject) => {
      xhr.onreadystatechange = (e: any) => {
        if (xhr.readyState === 4) {
          if (xhr.status === 200 || xhr.status === 201 || xhr.status === 204) {
            return this.parseResponse(this.xhr)
              .then((response) => { resolve(response) })
          }
          else if (xhr.status !== 0) {
            reject({ status_code: xhr.status })
          }
        }
      }
      xhr.onerror = function (e) {
        reject(e)
      }
      xhr.send(this.body)
      this.sendAttempts++
    })
  }

  /**
   * Handle parsing the response into JSON or other types,
   * depending on this.responseType
   *
   * @param {*} xhr
   * @returns {*}
   */
  parseResponse(xhr: any): Promise<any> {
    // IE does not support responseType = 'json'
    return new Promise((resolve, reject) => {
      try {
        // IE does not support responseType = 'json'
        let response = xhr.response
        if (this.responseType === 'json' && typeof response !== 'object') {
          resolve(JSON.parse(xhr.responseText))
        }

        // Interpret payload as an image (actually loaded as a blob,
        // then packed into an image). Using XHR for images
        // leaves duplicates in the Network Console, but allows
        // progress events and aborts, which is quite nice.
        // Does not work on Safari < 6
        else if (this.responseType === 'image') {
          const imageUrl = URL.createObjectURL(response)
          response = new Image()
          response.src = imageUrl
          response.crossOrigin = 'Anonymous'
          response.onload = function () {
            URL.revokeObjectURL(imageUrl)
            resolve(response)
          }
        }

        else {
          resolve(response)
        }
      }
      catch (e) {
        reject({ error: 'Payload was not valid JSON' })
      }
    })
  }

  /**
   *
   * Abort this request.
   *
   */
  abort() {
    if (this.xhr === null) {
      throw new Error('Cannot abort unsent Request')
    }
    this.xhr.abort()
  }
}
