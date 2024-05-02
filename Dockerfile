# Use the official Ruby image as the base
FROM ruby:3.3.0

# Set the working directory inside the container
WORKDIR /app

# Copy your Sinatra app files into the container
COPY . .

# Install dependencies (if needed)
RUN bundle install

# Specify the command to run your app
CMD ["bundle", "exec", "ruby", "app.rb", "-p", "8080"]

EXPOSE 8080
