# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY yarn.lock* ./

# Install all dependencies (required for build)
RUN npm ci

COPY . .

# Run Vite production build
RUN npm run build

# Stage 2: Serve using Nginx
FROM nginx:alpine

# Copy built assets
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
