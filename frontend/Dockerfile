# syntax=docker/dockerfile:1
FROM nginx:1.27-alpine

# The frontend is plain HTML/CSS/JS with no build step, so the files are
# copied straight in — no node_modules, no bundler, nothing to compile.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html

# Config files shouldn't be served as static assets.
RUN rm -f /usr/share/nginx/html/Dockerfile \
          /usr/share/nginx/html/nginx.conf \
          /usr/share/nginx/html/.dockerignore

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD nginx -t || exit 1