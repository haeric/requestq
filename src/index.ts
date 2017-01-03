declare var XDomainRequest: any

export enum RequestPriority {
  LOW, MEDIUM, HIGH, HIGHEST
}

export enum RequestStatus {
  PENDING, SENDING, FAILED, DONE
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
function openXHR (method: string, url: string, withCredentials: boolean): XMLHttpRequest {
  let xhr
  if (typeof XMLHttpRequest !== "undefined") {
    xhr = new XMLHttpRequest()
    xhr.withCredentials = withCredentials  
  }
  else if (typeof XDomainRequest !== "undefined") {
    xhr = new XDomainRequest()
  }
  else {
    throw new Error("No XMLHTTPRequest or XDomainRequest... are you trying to run me in node? :(")
  }
  xhr.open(method, url, true) 
  return xhr
}


export class RequestQueue {
  retries: number
  concurrency: number

  private queue: Array<Request> = []
  private updateInterval: number

  constructor({ retries = 3, concurrency = 6} = {}) {
    this.retries = retries
    this.concurrency = concurrency
    this.updateInterval = window.setInterval(() => {
      this.update()
    }, 16)
  }

  get(url: string, options: any): Promise<any> {
    return this.request("GET", url, options)
  }

  head(url: string, options: any): Promise<any> {
    return this.request("HEAD", url, options)
  }

  options(url: string, options: any): Promise<any> {
    return this.request("OPTIONS", url, options)
  }

  post(url: string, options: any): Promise<any> {
    return this.request("POST", url, options)
  }

  put(url: string, options: any): Promise<any> {
    return this.request("PUT", url, options)
  }

  patch(url: string, options: any): Promise<any> {
    return this.request("PATCH", url, options)
  }

  delete(url: string, options: any): Promise<any> {
    return this.request("DELETE", url, options)
  }

  request(method: string, url: string, options: any): Promise<any> {
    let req = new Request(method, url, options)
    this.enqueue(req)
    return req.promise
  }

  /**
   * Handle all queue changes, sending new requests etc
   * 
   */
  update() {
    let req;
    while (req = this.getNextPendingRequest()) {
      this.sendRequest(req)
    }
    // Cancel any requests put us over our concurrency
    // This happens when immediate requests bump other requests
    while (req = this.getNextOverflowingRequest()) {
      req.abort()
      req.status = RequestStatus.PENDING
    }
  }

  /**
   * Enqueue a request, adding it to the right place
   * in the queue based on the priority:
   * Highest prioriy first, oldest requests first
   * @private  
   * @param {Request} request
   */
  private enqueue(request: Request) {
    
    for (var index = 0; index < this.queue.length; index++) {
      let element = this.queue[index]
      if (element.priority < request.priority) {
        break
      }
    }
    this.queue.splice(index, 0, request)
  }

  /**
   * Remove an item from the queue.
   * Usually because the request is done, or it failed.
   * @private
   * @param {Request} req
   */
  private dequeue(req: Request) {
    let index = this.queue.indexOf(req)
    if (index === -1) {
      throw new Error("Can't dequeue request not in queue")
    }
    this.queue.splice(index, 1)
  }

  /**
   * Get the next request that is ready to send
   * 
   * @private
   * @returns {(Request | null)}
   */
  private getNextPendingRequest(): Request | null {
    for (let index = 0; index < this.queue.length && index < this.concurrency; index++) {
      let element = this.queue[index]
      if (element.status === RequestStatus.PENDING) {
        return element
      }
    }
    return null
  }

  /**
   * Get the next request that is currently in flight
   * but pushes us over our concurrency limit
   * 
   * @private
   * @returns {(Request | null)}
   */
  private getNextOverflowingRequest(): Request | null {
    for (let index = this.concurrency; index < this.queue.length; index++) {
      let element = this.queue[index]
      if (element.status === RequestStatus.SENDING && element.priority != RequestPriority.HIGHEST) {
        return element
      }
    }
    return null
  }

  private sendRequest(req: Request) {
    req.status = RequestStatus.SENDING
    req.send().then((e: any) => {
      req.status = RequestStatus.DONE
      this.dequeue(req)
      req.onDone(e)
    }).catch((e: any) => {
      if (req.sendAttempts < this.retries) {
        req.status = RequestStatus.PENDING
        console.warn(`Retried ${req.url}`)
        console.warn(e)
      }
      else {
        req.status = RequestStatus.FAILED
        req.onFail()
        this.dequeue(req)
        console.warn(`Failed ${req.url}`)
      }
    })
  }
}

class Request {
  url: string
  method: string
  priority: number
  responseType: string | null
  
  body: string | null
  headers: any

  sendAttempts = 0
  status = RequestStatus.PENDING
  
  promise: Promise<any>
  onDone: Function
  onFail: Function

  private xhr: XMLHttpRequest | null

  private validImageMimetypes = ['image/jpeg', 'image/png', 'image/webp']

  /**
   * Creates an instance of Request.
   * 
   * @param {string} method
   * @param {string} url
   * @param {any} options: { 
   *       priority = RequestPriority.MEDIUM, 
   *       responseType = null,
   *       body = null,
   *       headers = {}
   *     }
   */
  constructor(method: string, url: string, { 
      priority = RequestPriority.MEDIUM, 
      responseType = null,
      body = null,
      headers = {}
    } = {}) {
    this.url = url
    this.method = method

    this.priority = priority
    this.responseType = responseType
    this.body = body
    this.headers = headers

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
    const xhr = this.xhr = openXHR(this.method, this.url, false)

    if (this.responseType) {
      if (['arraybuffer', 'text', 'json', 'blob'].indexOf(this.responseType) > -1) {
        xhr.responseType = this.responseType
      }
      else if (this.responseType === 'image') {
        xhr.responseType = 'arraybuffer'
      }
      else {
        throw new Error('reponseType can only be one of "arraybuffer", "text", "json", "blob", "image"')
      }
    }

    if (this.responseType === 'json') {
      xhr.setRequestHeader('Accept', 'application/json')
    }
    
    for (let key in this.headers) {
      xhr.setRequestHeader(key, this.headers[key])
    }

    if (typeof this.body === 'object') {
      this.body = JSON.stringify(this.body)
      xhr.setRequestHeader('Content-Type', 'application/json')
    }
    
    return new Promise((resolve, reject) => {
      xhr.onreadystatechange = (e: any) => {
        if (xhr.readyState === 4) {
          if (xhr.status === 200 || xhr.status === 201 || xhr.status === 204) {
            let response
            try {
              response = this.parseResponse(this.xhr)
            }
            catch (e) {
              reject({error: "Payload was not valid JSON"})
              return  
            }
            resolve(response)
          }
          else if (xhr.status !== 0) {
            reject({status_code: xhr.status})
          }
        }
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
  parseResponse (xhr: any): any {
    // IE does not support responseType = 'json'
    let response = xhr.response
    if (this.responseType === 'json' && typeof response !== 'object') {
        response = JSON.parse(xhr.responseText)
    }
    // Does not work on Safari 5.1
    // image/jpeg is actually loaded as arraybuffer, then packed
    // in an Image.
    else if (this.responseType === 'image') {
      let arrayBufferView = new Uint8Array(xhr.response)
      let blob = new Blob([arrayBufferView], {type: xhr.getResponseHeader('Content-Type')})
      let imageUrl = URL.createObjectURL(blob)
      response = new Image()
      response.src = imageUrl
      response.crossOrigin = "Anonymous"
      response.onload = function() {
        URL.revokeObjectURL(imageUrl)
      }
    }
    return response
  }


  /**
   * 
   * Abort this request. 
   * 
   */
  abort () {
    if (this.xhr === null) {
      throw new Error("Cannot abort unsent Request")
    }
    this.xhr.abort()
  }
}
