/*!
  Copyright (c) 2019 DynAgility LLC. All rights reserved.
  Licensed under the MIT License.
*/

import 'reflect-metadata';
import express from 'express';
import { Request, Response } from 'express';
import * as bodyParser from 'body-parser';
import { default as morgan } from 'morgan';
import { default as promBundle } from 'express-prom-bundle';
import cookieparser from 'cookie-parser';

const API_BINDING_METADATA_KEY = Symbol('API_BINDING');
const CONTROLER_PATH_KEY = Symbol('CONTROLLER_PATH');
const MIDDLEWARE = Symbol('MIDDLEWARE');
const NOTFOUND = Symbol('NOTFOUND');
const CLIENTERROR = Symbol('CLIENTERROR');
type httpmethods = 'get' | 'post' | 'put' | 'delete' | 'patch';

export class NotFoundError extends Error {
  public type: Symbol;
  constructor() {
    super();
    this.type = NOTFOUND;
  }
}
export class ClientError extends Error {
  public type: Symbol;
  constructor() {
    super();
    this.type = CLIENTERROR;
  }
}

export function Controller(path: string): Function {
  return Reflect.metadata(CONTROLER_PATH_KEY, path);
}

export function Middleware(middleware: Function | Function[]): Function {
  return Reflect.metadata(MIDDLEWARE, middleware);
}

function api(path: string, httpmethod: httpmethods, auth?: boolean) {
  return Reflect.metadata(API_BINDING_METADATA_KEY, { path, httpmethod, auth});
}

export function Get(path: string, auth?: boolean) {
  return api(path, 'get', auth);
}

export function Post(path: string, auth?: boolean) {
  return api(path, 'post', auth);
}

export function Put(path: string, auth?: boolean) {
  return api(path, 'put', auth);
}

export function Delete(path: string, auth?: boolean) {
  return api(path, 'delete', auth);
}

export function Patch(path: string, auth?: boolean) {
  return api(path, 'patch', auth);
}

const catchErrors = <T>(apiHandler: (req, res) => T) => async function(req: Request, res: Response) {
  try {
    const handlerValue: T = await apiHandler(req, res);
    if (!res.headersSent) {
      if (handlerValue !== undefined) {
          res.send(handlerValue);
      } else {
          res.sendStatus(200);
      }
    }
  } catch (e) {
    switch (e.type) {
      case NOTFOUND:
        res.statusCode = 404;
        res.send({ error: 'Not Found' });
        break;
      case CLIENTERROR:
        res.statusCode = 400;
        res.send({ error: 'Malformed request'});
        break;
      default:
        res.statusCode = 500;
        res.send({ error: 'Internal Server Error' });
    }
    console.log(`Received an error from handler ${apiHandler.name} : `, e);
  }
};

function createCallbackArray(middlewares: Function | Function[] | undefined, handler: Function) {
  if (!middlewares) {
    return [handler];
  }
  if (Array.isArray(middlewares)) {
    return [...middlewares, handler];
  }
  return [middlewares, handler];
}

function getRouterfromDecorators(controller: any, ...middlewares) {
  const router = express.Router();
  middlewares.forEach((middleware) => router.use(middleware));
  let target = controller;
  let potentialProperties: string[] = [];
  while (target !== null) {
      potentialProperties = potentialProperties.concat(Object.getOwnPropertyNames(target));
      target = Object.getPrototypeOf(target);
  }
  const props = potentialProperties.map((method: string) => {
    const decorator = Reflect.getMetadata(API_BINDING_METADATA_KEY, controller, method);
    if (decorator === undefined) {
      return false;
    }

    let middlewares = Reflect.getMetadata(MIDDLEWARE, controller, method);
    if (middlewares !== undefined) {
      if (!Array.isArray(middlewares)) {
        middlewares = [middlewares];
      }
      middlewares = middlewares.map((mw) => mw.bind(controller));
    }
    router[decorator.httpmethod](decorator.path, ...createCallbackArray(middlewares, catchErrors(controller[method].bind(controller))));
    return true;
  });
  if (!props.some((i) => i)) {
    throw new TypeError(`GetRouterFromDecorators requires an obbject with Route Decorators. None were found on ${controller.name}.`);
  }
  return router;
}

const PORT = parseInt(process.env.SERVER_PORT || '3000');

export function InitializeExpress(port: number = PORT, name = 'ExpressJS', additionalMiddleware: Array<any> = [], ...controllers: any) {
  const app = express();
  const metricsMiddleware = promBundle({ includeMethod: true });
  const logger = morgan('tiny');
  app.use(bodyParser.json());
  app.use(cookieparser());
  app.use(metricsMiddleware);
  app.use(logger);

  // Use any other middleware passed in
  additionalMiddleware.forEach((m) => app.use(m));

  // Create routers for each controller
  controllers.forEach(controller => {
    let instance = controller;
    // We either get pre-initialized controllers or we need to initialize
    if (typeof instance === 'function') {
      instance = new controller();
      // Make sure that whatever the controller function was gave us an instance
      if (typeof instance !== 'object') {
        console.log(`Received non-constructor controller ${instance.name}`);
      }
    }
    const path = Reflect.getMetadata(CONTROLER_PATH_KEY, instance.constructor);
    if (!path) {
      // If we get a non-annotated class, skip it.
      console.log(`Received controller ${instance.name} but did not have an @Controller annotation.`);
      return;
    }
    let middlewares = Reflect.getMetadata(MIDDLEWARE, instance.constructor);
    if (middlewares !== undefined) {
      if (!Array.isArray(middlewares)) {
        middlewares = [middlewares];
      }
      middlewares = middlewares.map((mw) => mw.bind(instance));
    }
    app.use(path, ...createCallbackArray(middlewares, getRouterfromDecorators(instance)));
  });
  app.listen(port, () => console.log(`${name} listening on port ${port}`));
  return app;
}
