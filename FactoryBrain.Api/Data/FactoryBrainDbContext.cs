using FactoryBrain.Api.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Pgvector.EntityFrameworkCore;

namespace FactoryBrain.Api.Data;

/// <summary>
/// Root EF Core DbContext for the factoryBrain backend. Every aggregate
/// matches a table in PostgreSQL; vector columns use the pgvector type.
/// </summary>
public class FactoryBrainDbContext : DbContext
{
    public FactoryBrainDbContext(DbContextOptions<FactoryBrainDbContext> opts) : base(opts) { }

    public DbSet<FloorAlert>        FloorAlerts        => Set<FloorAlert>();
    public DbSet<LineBoardMetric>   LineBoardMetrics   => Set<LineBoardMetric>();
    public DbSet<QcDefect>          QcDefects          => Set<QcDefect>();
    public DbSet<SensorReading>     SensorReadings     => Set<SensorReading>();
    public DbSet<ManualDocument>    ManualDocuments    => Set<ManualDocument>();
    public DbSet<DocumentChunk>     DocumentChunks     => Set<DocumentChunk>();
    public DbSet<PolicyDocument>    Policies           => Set<PolicyDocument>();
    public DbSet<AgentDefinition>   Agents             => Set<AgentDefinition>();
    public DbSet<Insight>           Insights           => Set<Insight>();
    public DbSet<VisionResult>      VisionResults      => Set<VisionResult>();
    public DbSet<ApprovalRequest>   Approvals          => Set<ApprovalRequest>();
    public DbSet<OrderRecord>       Orders             => Set<OrderRecord>();
    public DbSet<ProductRecord>     Products           => Set<ProductRecord>();
    public DbSet<CustomerRecord>    Customers          => Set<CustomerRecord>();
    public DbSet<SupplierRecord>    Suppliers          => Set<SupplierRecord>();
    public DbSet<InventoryRecord>   Inventory          => Set<InventoryRecord>();
    public DbSet<ActivityEvent>     ActivityEvents     => Set<ActivityEvent>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        base.OnModelCreating(mb);
        mb.HasPostgresExtension("vector");
        mb.ApplyConfigurationsFromAssembly(typeof(FactoryBrainDbContext).Assembly);
    }
}
