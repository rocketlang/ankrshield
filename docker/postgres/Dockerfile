# Custom PostgreSQL image with TimescaleDB and pgvector
# Based on TimescaleDB HA image (PostgreSQL 15)

FROM timescale/timescaledb-ha:pg15-latest

USER root

# Install build dependencies and pgvector
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    postgresql-server-dev-15 \
    && rm -rf /var/lib/apt/lists/*

# Clone and build pgvector
RUN cd /tmp && \
    git clone --branch v0.5.1 https://github.com/pgvector/pgvector.git && \
    cd pgvector && \
    make && \
    make install && \
    cd / && \
    rm -rf /tmp/pgvector

# Clean up build dependencies to reduce image size
RUN apt-get remove -y build-essential git postgresql-server-dev-15 && \
    apt-get autoremove -y && \
    apt-get clean

# Verify pgvector installation
RUN echo "Verifying pgvector installation..." && \
    ls -la /usr/lib/postgresql/15/lib/vector.so && \
    ls -la /usr/share/postgresql/15/extension/vector*

# Add pgvector to shared_preload_libraries
RUN echo "shared_preload_libraries = 'timescaledb,vector'" >> /usr/share/postgresql/postgresql.conf.sample

LABEL maintainer="ankrshield <founders@ankrshield.com>"
LABEL description="PostgreSQL 15 with TimescaleDB and pgvector for ankrshield"
