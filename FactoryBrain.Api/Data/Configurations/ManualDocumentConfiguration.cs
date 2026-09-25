using FactoryBrain.Api.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pgvector;

namespace FactoryBrain.Api.Data.Configurations;

public class ManualDocumentConfiguration : IEntityTypeConfiguration<ManualDocument>
{
    public void Configure(EntityTypeBuilder<ManualDocument> b)
    {
        b.ToTable("manual_documents");
        b.HasKey(x => x.Id);
        b.Property(x => x.Tags).HasColumnType("text[]");
        b.HasMany(x => x.Chunks)
            .WithOne()
            .HasForeignKey(c => c.DocumentId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class DocumentChunkConfiguration : IEntityTypeConfiguration<DocumentChunk>
{
    public void Configure(EntityTypeBuilder<DocumentChunk> b)
    {
        b.ToTable("document_chunks");
        b.HasKey(x => x.Id);
        b.Property(x => x.Tags).HasColumnType("text[]");
        b.Property(x => x.Embedding).HasColumnType("vector(384)");        // pgvector
        b.HasIndex(x => x.DocumentId);
        b.HasIndex(x => new { x.Department, x.Category });
    }
}
