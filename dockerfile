# Use the official Rust image as a build environment.
FROM rust:1-slim-buster AS builder

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy the entire project into the container
COPY . .

# Build the project in release mode for performance
# The output will be at /usr/src/app/target/release/perf-reporter-test
RUN cargo build --release

# Use a minimal Debian image for the final, small container.
FROM debian:buster-slim AS runtime

# Set the working directory for the runtime container
WORKDIR /usr/src/app

# Copy the compiled binary from the builder stage, using the correct name.
COPY --from=builder /usr/src/app/target/release/perf-reporter-test /usr/local/bin/perf-reporter-test

# CRITICAL: Copy the templates and static asset directories
COPY templates ./templates
COPY static ./static

# Set the command to run the executable with the correct name.
CMD ["perf-reporter-test"]