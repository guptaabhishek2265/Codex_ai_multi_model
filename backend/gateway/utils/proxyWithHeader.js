import proxy from "express-http-proxy"
import { internalHeaders } from "../../shared/serviceAuth.js"

export const proxyWithHeader = (serviceUrl) => {
    return proxy(serviceUrl, {
        parseReqBody: false,
        limit: '25mb',
        proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
            delete proxyReqOpts.headers['x-user-id']
            delete proxyReqOpts.headers['x-service-token']
            Object.assign(proxyReqOpts.headers, internalHeaders(srcReq.user?.userId))
            return proxyReqOpts
        }
    })
}
