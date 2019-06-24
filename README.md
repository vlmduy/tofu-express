# tofu-express

A library of decorators to define class based "controller" classes.

Controllers are specify a path and are used to generate an express Router.

InitializeExpress creates (and returns) an express app with our most commonly used middleware (morgan for logging, body-parser, and express-prom-bundle).

Default port is loaded from envvar SERVER_PORT and set to 3000 by default if no var is set. Controller classes passed in will be instantiated then transformed into routers. The router is then applied to the path specified in their decorator.

```typescript
function InitializeExpress(port: number = PORT, name = 'ExpressJS', middlware = [], ...controllers: any)
```
Example:

```typescript
@Controller('/api')
class TestController {
  constructor() {
  }

  @Get('/test')
  Test(req: Request) {
    return {'STATUS': 'OK'};
  }
}

InitializeExpress(3000, 'Test App', [], TestController);
```
