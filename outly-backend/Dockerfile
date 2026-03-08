# Use official Node image
FROM node:20

# Create app directory inside container
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of the project
COPY . .

# Expose backend port
EXPOSE 5000

# Run the server
CMD ["npm", "run", "dev"]