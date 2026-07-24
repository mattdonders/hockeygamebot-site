import { onRequestGet as __games__id__ts_onRequestGet } from "/Users/mattdonders/Development/hgb/hockeygamebot-site/functions/games/[id].ts"

export const routes = [
    {
      routePath: "/games/:id",
      mountPath: "/games",
      method: "GET",
      middlewares: [],
      modules: [__games__id__ts_onRequestGet],
    },
  ]